import { db } from '@/lib/db'

/**
 * Med Scheduler — shared helper for generating medication administration records.
 *
 * Used by:
 *   - /api/dashboard (on every dashboard load — acts as daily cron)
 *   - /api/meds/generate (manual trigger)
 *
 * How it works:
 *   1. Fetches all active medications for ACTIVE residents
 *   2. For each med, determines the scheduled times for the target date:
 *      a. If med.scheduleTimes is set (staff-specified JSON array of "HH:mm"),
 *         use those times
 *      b. Otherwise, auto-derive times from the frequency text
 *   3. Creates MedAdministration records (PENDING) for each dose
 *   4. Idempotent — skips doses that already exist for that med+date+time
 *
 * Frequency → times mapping (auto-derived when no custom scheduleTimes):
 *   "once daily" / "morning" / "breakfast" → [08:00]
 *   "once daily at bedtime" / "night" / "bedtime" → [22:00]
 *   "once daily evening" → [18:00]
 *   "twice daily" → [08:00, 20:00]
 *   "three times daily" → [08:00, 14:00, 20:00]
 *   "four times daily" → [08:00, 12:00, 16:00, 20:00]
 *   "every 4 hours" → [08:00, 12:00, 16:00, 20:00, 00:00]
 *   "every 6 hours" → [08:00, 14:00, 20:00, 02:00]
 *   "every 8 hours" → [08:00, 16:00, 00:00]
 *   "once weekly" → [08:00] on the same weekday as startDate
 *   "prn" / "as needed" → [08:00] (one placeholder; staff administer as needed)
 *   default → [08:00]
 */

export interface GenerateResult {
  created: number
  skipped: number
  message: string
}

/**
 * Derives the default schedule times from a frequency string.
 * Returns an array of "HH:mm" strings.
 */
export function deriveTimesFromFrequency(frequency: string): string[] {
  const freq = (frequency || '').toLowerCase()

  // PRN / As needed — one placeholder dose
  if (freq.includes('prn') || freq.includes('as needed')) return ['08:00']

  // Bedtime / night
  if (freq.includes('bedtime') || freq.includes('night')) return ['22:00']

  // Morning / Before breakfast
  if (freq.includes('morning') || freq.includes('breakfast')) return ['08:00']

  // Evening
  if (freq.includes('evening')) return ['18:00']

  // Multi-dose frequencies
  if (freq.includes('four times') || freq.includes('4 times')) return ['08:00', '12:00', '16:00', '20:00']
  if (freq.includes('three times') || freq.includes('3 times')) return ['08:00', '14:00', '20:00']
  if (freq.includes('twice') || freq.includes('2 times')) return ['08:00', '20:00']

  // Every N hours
  const everyMatch = freq.match(/every\s+(\d+)\s+hours?/)
  if (everyMatch) {
    const hours = parseInt(everyMatch[1], 10)
    const times: string[] = []
    for (let h = 8; h < 24 + 8; h += hours) {
      const hh = ((h % 24) + 24) % 24
      times.push(`${String(hh).padStart(2, '0')}:00`)
    }
    // Deduplicate (e.g. every 12 hours → [08:00, 20:00])
    return [...new Set(times)]
  }

  // Once weekly — just one dose at 8 AM (the day-of-week is handled by the generator)
  if (freq.includes('weekly') || freq.includes('once a week')) return ['08:00']

  // Once daily (default)
  return ['08:00']
}

/**
 * Parses the scheduleTimes JSON string on a Medication into an array of "HH:mm".
 * Falls back to deriveTimesFromFrequency if not set or invalid.
 */
export function getScheduleTimes(med: { frequency: string; scheduleTimes?: string | null }): string[] {
  if (med.scheduleTimes) {
    try {
      const parsed = JSON.parse(med.scheduleTimes)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(t => String(t)).filter(t => /^\d{2}:\d{2}$/.test(t))
      }
    } catch {}
  }
  return deriveTimesFromFrequency(med.frequency)
}

/**
 * Determines whether a medication should be administered on a given date,
 * based on its frequency (especially for "once weekly" meds).
 */
function shouldAdministerOnDate(med: { frequency: string; startDate: Date | string }, targetDate: Date): boolean {
  const freq = (med.frequency || '').toLowerCase()

  // Once weekly — only on the same weekday as startDate
  if (freq.includes('weekly') || freq.includes('once a week')) {
    const startDay = new Date(med.startDate).getDay()
    const targetDay = targetDate.getDay()
    return startDay === targetDay
  }

  // All other frequencies — daily
  return true
}

/**
 * Generates medication administration records for a target date.
 * Idempotent — skips doses that already exist.
 *
 * @param targetDate The date to generate administrations for (time is ignored, only the date matters)
 * @returns { created, skipped, message }
 */
export async function generateMedAdministrations(targetDate: Date): Promise<GenerateResult> {
  const start = new Date(targetDate)
  start.setHours(0, 0, 0, 0)
  const end = new Date(targetDate)
  end.setHours(23, 59, 59, 999)

  // Quick check: are there already admins for this date?
  const existingCount = await db.medAdministration.count({
    where: { scheduledAt: { gte: start, lte: end } },
  })

  const activeMeds = await db.medication.findMany({
    where: { active: true },
    include: { resident: { select: { id: true, status: true } } },
  })

  // Filter to ACTIVE residents only
  const validMeds = activeMeds.filter(m => m.resident?.status === 'ACTIVE')

  let created = 0
  let skipped = 0

  for (const med of validMeds) {
    // Check if this med should be administered on this date (e.g. weekly meds)
    if (!shouldAdministerOnDate(med, targetDate)) {
      continue
    }

    // Check if med has already ended
    if (med.endDate && new Date(med.endDate) < start) {
      continue
    }

    // Get the schedule times for this med
    const times = getScheduleTimes(med)

    for (const timeStr of times) {
      const [hours, minutes] = timeStr.split(':').map(Number)
      const scheduledAt = new Date(targetDate)
      scheduledAt.setHours(hours, minutes, 0, 0)

      // Check if this exact dose already exists
      const existing = await db.medAdministration.findFirst({
        where: {
          medicationId: med.id,
          scheduledAt,
        },
      })

      if (existing) {
        skipped++
        continue
      }

      await db.medAdministration.create({
        data: {
          medicationId: med.id,
          residentId: med.residentId,
          scheduledAt,
          status: 'PENDING',
        },
      }).catch(() => {
        // Ignore duplicate key errors (race condition)
        skipped++
      })
      created++
    }
  }

  const dateStr = targetDate.toDateString()
  return {
    created,
    skipped,
    message: `Generated ${created} medication administrations for ${dateStr} (${skipped} already existed)`,
  }
}

/**
 * Generates tomorrow's medication administrations.
 * This is the main entry point called by the dashboard on every load.
 */
export async function generateTomorrowMeds(): Promise<GenerateResult> {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  return generateMedAdministrations(tomorrow)
}

/**
 * Generates medication administrations for the next N days.
 * Called by the manual /api/meds/generate endpoint.
 */
export async function generateMedsForDays(daysAhead: number): Promise<GenerateResult> {
  let totalCreated = 0
  let totalSkipped = 0

  for (let i = 1; i <= daysAhead; i++) {
    const date = new Date()
    date.setDate(date.getDate() + i)
    const result = await generateMedAdministrations(date)
    totalCreated += result.created
    totalSkipped += result.skipped
  }

  return {
    created: totalCreated,
    skipped: totalSkipped,
    message: `Generated ${totalCreated} medication administrations for the next ${daysAhead} day(s) (${totalSkipped} already existed)`,
  }
}
