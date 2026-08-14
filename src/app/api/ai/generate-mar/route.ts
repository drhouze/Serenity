import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { callAI, getAIConfig, isFeatureEnabled } from '@/lib/ai'
import { generateMedAdministrations } from '@/lib/med-scheduler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/ai/generate-mar
 *
 * AI-powered MAR generator: takes a visit note's free-text prescription
 * (e.g. "Metformin 500mg BD, Amlodipine 5mg OD morning") and uses AI to
 * parse it into structured medication data, then creates Medication records
 * + generates MedAdministration records (MAR entries) for the resident.
 *
 * Body: { visitId: string }
 *
 * Flow:
 *   1. Fetch the visit (must be COMPLETED + have a prescription)
 *   2. Call AI with the prescription text, asking it to return JSON:
 *      [{ name, dosage, frequency, route, scheduleTimes }]
 *   3. For each parsed med, create a Medication record (linked to the resident)
 *      — skip if an identical active med already exists
 *   4. Run the med-scheduler for today + tomorrow to generate MAR entries
 *   5. Return the created meds + MAR count
 *
 * The AI feature must be enabled for the org (feature id: MAR_GENERATOR).
 * Falls back gracefully if AI is not configured — returns an error message
 * telling the user to ask the Developer to enable AI.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { visitId } = await req.json()
  if (!visitId) {
    return NextResponse.json({ error: 'visitId is required' }, { status: 400 })
  }

  // Fetch the visit with resident info
  const visit = await db.visit.findUnique({
    where: { id: visitId },
    include: {
      resident: {
        select: { id: true, code: true, firstName: true, lastName: true, facilityId: true, status: true },
      },
    },
  })

  if (!visit) {
    return NextResponse.json({ error: 'Visit not found' }, { status: 404 })
  }

  if (!visit.prescription || visit.prescription.trim().length === 0) {
    return NextResponse.json({ error: 'This visit note has no prescription to generate MAR from.' }, { status: 400 })
  }

  // Check AI is enabled
  const orgId = user.organizationId
  if (!orgId) {
    return NextResponse.json({ error: 'Your account is not linked to an organization.' }, { status: 400 })
  }

  const config = await getAIConfig(orgId)
  if (!config) {
    return NextResponse.json({
      error: 'AI is not enabled for your organization. Ask the App Developer to enable AI in Settings → AI Assistant.',
    }, { status: 403 })
  }

  if (!isFeatureEnabled(config, 'MAR_GENERATOR')) {
    return NextResponse.json({
      error: 'The "MAR Generator" AI feature is not enabled for your organization. Enable it in Settings → AI Assistant.',
    }, { status: 403 })
  }

  // ===== 1. Call AI to parse the prescription =====
  const systemPrompt = `You are a clinical pharmacist assistant. You parse free-text prescriptions into structured JSON.
Return ONLY a JSON array (no markdown, no explanation). Each element must have:
  - name: medication name (e.g. "Metformin")
  - dosage: strength + form (e.g. "500mg tablet")
  - frequency: how often to take (use one of: "Once daily", "Twice daily", "Three times daily", "Four times daily", "Once daily at bedtime", "Every 4 hours", "Every 6 hours", "Every 8 hours", "PRN every 4 hours", "As needed", "Once weekly")
  - route: one of "Oral Tablet", "Oral Syrup", "Crushed Tablet", "Subcutaneous", "IM", "IV", "Topical", "Inhalation", "Rectal", "Vaginal", "Ophthalmic", "Otic", "Nasal", "Other"
  - scheduleTimes: JSON array of "HH:mm" times (24h) when doses should be given

Examples:
  Input: "Metformin 500mg BD, Amlodipine 5mg OD morning"
  Output: [{"name":"Metformin","dosage":"500mg","frequency":"Twice daily","route":"Oral Tablet","scheduleTimes":["08:00","20:00"]},{"name":"Amlodipine","dosage":"5mg","frequency":"Once daily","route":"Oral Tablet","scheduleTimes":["08:00"]}]

  Input: "Panadol 1g PRN TDS"
  Output: [{"name":"Panadol","dosage":"1g","frequency":"Three times daily","route":"Oral Tablet","scheduleTimes":["08:00","14:00","20:00"]}]

If you cannot parse a medication, omit it from the array. If the entire prescription is unparseable, return [].`

  const prompt = `Parse this prescription into structured JSON:
Prescription: ${visit.prescription}

Resident: ${visit.resident.firstName} ${visit.resident.lastName} (${visit.resident.code})
Visit type: ${visit.visitType}
Diagnosis: ${visit.diagnosis || '—'}
Doctor: ${visit.completedByName || '—'}

Return ONLY the JSON array.`

  const aiResult = await callAI({
    organizationId: orgId,
    feature: 'MAR_GENERATOR',
    prompt,
    systemPrompt,
    userId: user.id,
    userName: user.name,
    residentId: visit.resident.id,
    maxTokens: 1500,
  })

  if (!aiResult.success) {
    return NextResponse.json({ error: aiResult.error || 'AI request failed' }, { status: 500 })
  }

  // ===== 2. Parse the AI response into structured meds =====
  let parsedMeds: any[] = []
  try {
    // The AI might return markdown-wrapped JSON or plain JSON
    let content = aiResult.content || ''
    // Strip markdown code fences if present
    content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    // Find the JSON array (starts with [ and ends with ])
    const start = content.indexOf('[')
    const end = content.lastIndexOf(']')
    if (start >= 0 && end > start) {
      content = content.slice(start, end + 1)
    }
    parsedMeds = JSON.parse(content)
    if (!Array.isArray(parsedMeds)) {
      throw new Error('AI response is not an array')
    }
  } catch (e: any) {
    console.error('Failed to parse AI response:', aiResult.content, e)
    return NextResponse.json({
      error: 'AI returned an unparseable response. Please try again or add the medications manually.',
      rawResponse: (aiResult.content || '').slice(0, 500),
    }, { status: 500 })
  }

  if (parsedMeds.length === 0) {
    return NextResponse.json({
      success: true,
      created: [],
      marCount: 0,
      message: 'AI could not identify any structured medications in the prescription. Please add them manually.',
    })
  }

  // ===== 3. Create Medication records (skip duplicates) =====
  const doctorName = visit.completedByName || null
  const createdMeds = []
  const skippedMeds = []

  for (const pm of parsedMeds) {
    if (!pm.name || typeof pm.name !== 'string') {
      skippedMeds.push({ ...pm, reason: 'Missing name' })
      continue
    }

    // Check if an identical active med already exists for this resident
    const existing = await db.medication.findFirst({
      where: {
        residentId: visit.resident.id,
        active: true,
        name: { equals: pm.name, mode: 'insensitive' },
        dosage: pm.dosage || '',
      },
    })
    if (existing) {
      skippedMeds.push({ ...pm, reason: 'Already exists' })
      continue
    }

    // Build scheduleTimes JSON
    let scheduleTimesJson: string | null = null
    if (Array.isArray(pm.scheduleTimes) && pm.scheduleTimes.length > 0) {
      const validTimes = pm.scheduleTimes.filter((t: any) => typeof t === 'string' && /^\d{2}:\d{2}$/.test(t))
      if (validTimes.length > 0) {
        scheduleTimesJson = JSON.stringify(validTimes)
      }
    }

    const med = await db.medication.create({
      data: {
        residentId: visit.resident.id,
        name: pm.name.trim(),
        dosage: pm.dosage || '',
        frequency: pm.frequency || 'Once daily',
        route: pm.route || 'Oral Tablet',
        duration: pm.duration || 'Ongoing',
        prescribedBy: doctorName,
        scheduleTimes: scheduleTimesJson,
        active: true,
        notes: `Auto-created from visit note (${visit.visitType}) on ${new Date().toLocaleDateString()} via AI MAR Generator`,
      },
    })
    createdMeds.push({ ...med, scheduleTimes: pm.scheduleTimes })
  }

  // ===== 4. Generate MAR entries for today + tomorrow =====
  let totalMAR = 0
  if (createdMeds.length > 0) {
    const today = new Date()
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)

    const todayResult = await generateMedAdministrations(today)
    totalMAR += todayResult.created

    const tomorrowResult = await generateMedAdministrations(tomorrow)
    totalMAR += tomorrowResult.created
  }

  return NextResponse.json({
    success: true,
    created: createdMeds.map(m => ({
      id: m.id,
      name: m.name,
      dosage: m.dosage,
      frequency: m.frequency,
      route: m.route,
      scheduleTimes: m.scheduleTimes,
    })),
    skipped: skippedMeds,
    marCount: totalMAR,
    tokensUsed: aiResult.tokensUsed,
    message: `Created ${createdMeds.length} medication${createdMeds.length === 1 ? '' : 's'} + ${totalMAR} MAR entr${totalMAR === 1 ? 'y' : 'ies'} (today + tomorrow).${skippedMeds.length > 0 ? ` ${skippedMeds.length} skipped (already exist).` : ''}`,
  })
}
