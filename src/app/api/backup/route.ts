import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db, resetPrismaClient } from '@/lib/db'
import { logAudit, AUDIT_ACTIONS, getFacilityName } from '@/lib/audit'
import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import { ZipArchive } from 'archiver'
import { Writable } from 'stream'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// GET /api/backup — exports the database in the requested format
//   ?format=json (default) — single JSON file with all tables (works on Vercel + local)
//   ?format=csv             — ZIP archive containing one CSV per table (Developer only)
//   ?format=db              — Raw SQLite file copy (Developer only, local-only — won't work on Vercel)
//
// Developer gets ALL data. Owner/Manager gets only their facilities' data (JSON only).
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'APP_DEVELOPER' && user.role !== 'OWNER' && user.role !== 'MANAGER') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const isDeveloper = user.role === 'APP_DEVELOPER'
  const url = new URL(req.url)
  const format = (url.searchParams.get('format') || 'json').toLowerCase()

  // CSV and DB formats are Developer-only — they expose all raw data
  if (!isDeveloper && (format === 'csv' || format === 'db')) {
    return NextResponse.json(
      { error: `${format.toUpperCase()} format is only available to the App Developer. Use ?format=json for facility-scoped export.` },
      { status: 403 },
    )
  }

  // For Owner/Manager, determine their accessible facility IDs
  let userFacilityIds: string[] = []
  if (!isDeveloper) {
    if (user.level === 1 && user.organizationId) {
      const orgFacilities = await db.facility.findMany({
        where: { organizationId: user.organizationId },
        select: { id: true },
      })
      userFacilityIds = orgFacilities.map(f => f.id)
    } else {
      userFacilityIds = (user.facilityIds || '').split(',').map(s => s.trim()).filter(Boolean)
    }
  }

  try {
    // === DB FORMAT — raw SQLite file copy (Developer only, local-only) ===
    // NOTE: this format only works when running on SQLite (local dev / self-hosted).
    // On Vercel + Supabase (PostgreSQL), the "DB" button is hidden from the UI
    // and this branch returns a friendly error if reached directly.
    if (format === 'db') {
      const dbUrl = process.env.DATABASE_URL || ''
      const isSqlite = dbUrl.startsWith('file:')
      if (!isSqlite) {
        return NextResponse.json(
          { error: 'Raw .db backup is only available when running on SQLite (local dev). On Vercel + Supabase, use JSON or CSV format instead.' },
          { status: 400 },
        )
      }
      const match = dbUrl.match(/^file:(.+)$/)
      if (!match) {
        return NextResponse.json(
          { error: 'DB format requires a file-based SQLite DATABASE_URL. Current DATABASE_URL is not a file path.' },
          { status: 400 },
        )
      }
      const dbPath = match[1]
      if (!existsSync(dbPath)) {
        return NextResponse.json({ error: `Database file not found at: ${dbPath}` }, { status: 500 })
      }

      // Checkpoint the WAL so all data is in the main .db file before copying.
      try {
        await db.$executeRawUnsafe('PRAGMA wal_checkpoint(TRUNCATE)')
      } catch {
        // ignore — best-effort checkpoint
      }

      const buffer = await readFile(dbPath)
      const filename = `backup-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.db`

      await logAudit({
        userId: user.id, userName: user.name, userCode: user.code, userRole: user.role,
        action: AUDIT_ACTIONS.DATABASE_BACKUP, entityType: 'SYSTEM', entityId: '',
        description: `${user.name} downloaded a raw SQLite database backup — ${filename} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`,
        metadata: { filename, format: 'db', bytes: buffer.length },
        facilityId: null, facilityName: null,
      }).catch(() => {})

      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/x-sqlite3',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': String(buffer.length),
        },
      })
    }

    // === JSON + CSV formats share the same data extraction ===
    // Build the facility filter for org-scoped export
    const facilityFilter = !isDeveloper && userFacilityIds.length > 0
      ? { facilityId: { in: userFacilityIds } }
      : {}

    // Export all tables as JSON
    const exportData: Record<string, any[]> = {}

    // Core tables
    exportData.organizations = await db.organization.findMany()
    exportData.facilities = isDeveloper ? await db.facility.findMany() : await db.facility.findMany({ where: { id: { in: userFacilityIds } } })
    exportData.users = isDeveloper ? await db.user.findMany() : await db.user.findMany({
      where: { OR: userFacilityIds.flatMap(fid => [{ facilityIds: { contains: fid } }, { level: 1, role: 'OWNER' as any }]) },
    })

    // Resident-related
    exportData.residents = await db.resident.findMany({ where: facilityFilter })
    exportData.rooms = await db.room.findMany({ where: facilityFilter })
    exportData.beds = await db.bed.findMany({ where: { room: facilityFilter } })
    exportData.staff = await db.staff.findMany({ where: facilityFilter })
    exportData.medications = await db.medication.findMany({ where: { resident: facilityFilter } })
    exportData.medAdministrations = await db.medAdministration.findMany({ where: { resident: facilityFilter } })
    exportData.vitalSigns = await db.vitalSign.findMany({ where: { resident: facilityFilter } })
    exportData.visits = await db.visit.findMany({ where: { resident: facilityFilter } })
    exportData.incidentReports = await db.incidentReport.findMany({ where: { resident: facilityFilter } })
    exportData.careLogs = await db.careLog.findMany({ where: { resident: facilityFilter } })
    exportData.familyMessages = await db.familyMessage.findMany({ where: { resident: facilityFilter } })
    exportData.residentStatusLogs = await db.residentStatusLog.findMany({ where: { resident: facilityFilter } })

    // Shifts/leaves/attendance/payroll
    exportData.shifts = await db.shift.findMany({ where: { staff: facilityFilter } })
    exportData.staffLeaves = await db.staffLeave.findMany({ where: { staff: facilityFilter } })
    exportData.staffAttendances = await db.staffAttendance.findMany({ where: { staff: facilityFilter } })
    exportData.payrolls = await db.payroll.findMany({ where: facilityFilter })
    exportData.payrollLineItems = await db.payrollLineItem.findMany({ where: { payroll: facilityFilter } })

    // Financial
    exportData.invoices = await db.invoice.findMany({ where: facilityFilter })
    exportData.invoiceItems = await db.invoiceItem.findMany({ where: { resident: facilityFilter } })
    exportData.expenses = await db.expense.findMany({ where: facilityFilter })
    exportData.payments = await db.payment.findMany({ where: facilityFilter })
    exportData.paymentApplications = await db.paymentApplication.findMany({
      where: { invoice: facilityFilter },
    })
    exportData.products = await db.product.findMany({ where: facilityFilter })
    exportData.inventoryItems = await db.inventoryItem.findMany({ where: facilityFilter })
    exportData.inventoryTransactions = await db.inventoryTransaction.findMany({
      where: { item: facilityFilter },
    })
    exportData.vendors = await db.vendor.findMany({ where: facilityFilter })
    exportData.bankAccounts = await db.bankAccount.findMany({ where: facilityFilter })
    exportData.deposits = await db.deposit.findMany({ where: facilityFilter })
    exportData.purchaseOrders = await db.purchaseOrder.findMany({ where: facilityFilter })
    exportData.purchaseOrderLines = await db.purchaseOrderLine.findMany({
      where: { purchaseOrder: facilityFilter },
    })
    exportData.stockTransfers = isDeveloper
      ? await db.stockTransfer.findMany()
      : await db.stockTransfer.findMany({
          where: { OR: [{ fromFacilityId: { in: userFacilityIds } }, { toFacilityId: { in: userFacilityIds } }] },
        })
    exportData.stockTransferLines = await db.stockTransferLine.findMany({
      where: { stockTransfer: { OR: [{ fromFacilityId: { in: userFacilityIds } }, { toFacilityId: { in: userFacilityIds } }] } },
    })

    // Accounting
    exportData.accounts = await db.account.findMany({ where: facilityFilter })
    exportData.journalEntries = await db.journalEntry.findMany({ where: facilityFilter })
    exportData.journalLines = await db.journalLine.findMany({
      where: { journalEntry: facilityFilter },
    })

    // Custom fields
    exportData.globalCustomFields = await db.globalCustomField.findMany()
    exportData.orgCustomFields = await db.orgCustomField.findMany()
    exportData.globalCustomTabs = await db.globalCustomTab.findMany()
    exportData.orgCustomTabs = await db.orgCustomTab.findMany()
    exportData.customFieldValues = await db.customFieldValue.findMany()
    exportData.customFieldValueVersions = await db.customFieldValueVersion.findMany()

    // Settings
    exportData.settings = isDeveloper
      ? await db.setting.findMany()
      : await db.setting.findMany({ where: { OR: [{ facilityId: null }, { facilityId: { in: userFacilityIds } }] } })

    // Audit logs (only for developer)
    if (isDeveloper) {
      exportData.auditLogs = await db.auditLog.findMany({ take: 10000, orderBy: { createdAt: 'desc' } })
      exportData.aiTokenUsage = await db.aITokenUsage.findMany({ take: 10000, orderBy: { createdAt: 'desc' } })
    }

    const baseFilename = `backup-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`
    const facility = await getFacilityName(userFacilityIds[0] || null)

    // === JSON FORMAT (default) ===
    if (format === 'json') {
      const jsonString = JSON.stringify({
        _meta: {
          exportedAt: new Date().toISOString(),
          exportedBy: user.name,
          scope: isDeveloper ? 'full' : 'facility',
          facilityIds: userFacilityIds,
          version: '2.0',
          tableCount: Object.keys(exportData).length,
          rowCount: Object.values(exportData).reduce((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0),
        },
        data: exportData,
      }, null, 2)

      const filename = `${baseFilename}.json`
      await logAudit({
        userId: user.id, userName: user.name, userCode: user.code, userRole: user.role,
        action: AUDIT_ACTIONS.DATABASE_BACKUP, entityType: 'SYSTEM', entityId: '',
        description: `${user.name} downloaded a JSON database backup (${isDeveloper ? 'full' : 'facility-scoped'}) — ${filename}`,
        metadata: { filename, scope: isDeveloper ? 'full' : 'facility', facilityIds: userFacilityIds, format: 'json' },
        facilityId: userFacilityIds[0] || null, facilityName: facility,
      }).catch(() => {})

      return new NextResponse(jsonString, {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      })
    }

    // === CSV FORMAT — ZIP of one CSV per table ===
    if (format === 'csv') {
      // Build CSV files in memory
      const csvFiles: { name: string; content: string }[] = []

      // Add a meta file with export info
      const metaLines = [
        'key,value',
        `exportedAt,${new Date().toISOString()}`,
        `exportedBy,${user.name}`,
        `scope,${isDeveloper ? 'full' : 'facility'}`,
        `version,2.0`,
        `tableCount,${Object.keys(exportData).length}`,
        `rowCount,${Object.values(exportData).reduce((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0)}`,
      ]
      csvFiles.push({ name: '_meta.csv', content: metaLines.join('\n') })

      // Convert each table to CSV
      for (const [tableName, rows] of Object.entries(exportData)) {
        if (!Array.isArray(rows) || rows.length === 0) {
          // Empty table — still emit a header-only CSV
          csvFiles.push({ name: `${tableName}.csv`, content: '' })
          continue
        }

        // Collect all unique keys across all rows (some rows may have different keys due to optional fields)
        const allKeys = new Set<string>()
        for (const row of rows) {
          if (row && typeof row === 'object') {
            for (const k of Object.keys(row)) allKeys.add(k)
          }
        }
        const keys = Array.from(allKeys).sort()

        // Escape CSV value: wrap in quotes if it contains comma/quote/newline; escape inner quotes by doubling
        const escape = (val: any): string => {
          if (val === null || val === undefined) return ''
          let s = typeof val === 'object' ? JSON.stringify(val) : String(val)
          if (/[",\n\r]/.test(s)) {
            s = '"' + s.replace(/"/g, '""') + '"'
          }
          return s
        }

        const header = keys.map(escape).join(',')
        const dataRows = rows.map((row: any) => keys.map(k => escape(row[k])).join(','))
        csvFiles.push({
          name: `${tableName}.csv`,
          content: [header, ...dataRows].join('\n'),
        })
      }

      // Build the ZIP archive using `archiver` (pure-JS, no system `zip` binary needed).
      // This works on Vercel serverless + local dev + Docker — anywhere Node.js runs.
      // The ZIP is streamed directly into a Buffer (no temp files, no disk I/O).
      const zipBuffer = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = []
        const writable = new Writable({
          write(chunk: Buffer, _encoding: string, callback: () => void) {
            chunks.push(chunk)
            callback()
          },
        })

        const archive = new ZipArchive({ zlib: { level: 6 } })

        archive.on('error', err => reject(err))
        writable.on('error', err => reject(err))
        writable.on('finish', () => {
          const fullBuffer = Buffer.concat(chunks)
          resolve(fullBuffer)
        })

        // Pipe the archive output → our writable stream (collects into memory)
        archive.pipe(writable)

        // Append each CSV file to the archive
        for (const f of csvFiles) {
          archive.append(f.content, { name: f.name, date: new Date() })
        }

        // Finalize — signals the archive is done, flushes the stream
        archive.finalize()
      })

      await logAudit({
        userId: user.id, userName: user.name, userCode: user.code, userRole: user.role,
        action: AUDIT_ACTIONS.DATABASE_BACKUP, entityType: 'SYSTEM', entityId: '',
        description: `${user.name} downloaded a CSV ZIP backup — ${baseFilename}.zip (${csvFiles.length} files, ${(zipBuffer.length / 1024).toFixed(1)} KB)`,
        metadata: { filename: `${baseFilename}.zip`, format: 'csv', fileCount: csvFiles.length, bytes: zipBuffer.length },
        facilityId: null, facilityName: null,
      }).catch(() => {})

      return new NextResponse(new Uint8Array(zipBuffer), {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': `attachment; filename="${baseFilename}.zip"`,
          'Content-Length': String(zipBuffer.length),
        },
      })
    }

    return NextResponse.json({ error: `Unknown format: ${format}` }, { status: 400 })
  } catch (e: any) {
    console.error('Backup error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
