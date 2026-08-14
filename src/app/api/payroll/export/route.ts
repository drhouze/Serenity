import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/payroll/export?month=2026-08&format=kwsp|socso|bank|lhdn&facilityId=X
 *
 * Generates files formatted for Malaysian statutory portals:
 *   - kwsp:  KWSP i-Akaun (Employer) EPF contribution file (.txt — tab-separated)
 *   - socso: PERKESO ASSIST portal SOCSO + EIS file (.csv)
 *   - bank:  Bank online portal salary disbursement file (.csv — Maybank/CIMB/RHB format)
 *   - lhdn:  LHDN e-Data PCB monthly tax submission file (.csv)
 *
 * Only includes PAID payrolls. Skips "OTHER" employment type (no statutory).
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'APP_DEVELOPER' && user.role !== 'OWNER' && user.role !== 'MANAGER') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month')
  const format = searchParams.get('format') || 'kwsp'
  const facilityId = searchParams.get('facilityId') || undefined

  if (!month) return NextResponse.json({ error: 'month parameter is required (YYYY-MM)' }, { status: 400 })

  const where: any = { payrollMonth: month, status: 'PAID' }
  if (facilityId) where.facilityId = facilityId

  const payrolls = await db.payroll.findMany({
    where,
    include: {
      staff: {
        select: {
          id: true, firstName: true, lastName: true, code: true,
          icNumber: true, phone: true, email: true,
          epfNumber: true, socsoNumber: true, taxNumber: true,
          bankName: true, bankAccount: true, employmentType: true,
        }
      },
    },
    orderBy: { staff: { lastName: 'asc' } },
  })

  if (payrolls.length === 0) {
    return NextResponse.json({ error: `No PAID payrolls found for ${month}` }, { status: 404 })
  }

  // Filter out "OTHER" employment type for statutory exports
  const statutory = payrolls.filter(p => p.staff.employmentType !== 'OTHER')

  // ===== KWSP i-Akaun (Employer) EPF Export =====
  if (format === 'kwsp') {
    const lines: string[] = []
    lines.push('No.\tIC Number\tEPF Number\tEmployee Name\tEmployee Contribution (RM)\tEmployer Contribution (RM)\tTotal Contribution (RM)')
    let tEmp = 0, tEr = 0
    statutory.forEach((p, i) => {
      const emp = p.epfEmployee || 0, er = p.epfEmployer || 0
      tEmp += emp; tEr += er
      lines.push(`${i + 1}\t${p.staff.icNumber || ''}\t${p.staff.epfNumber || ''}\t${p.staff.firstName} ${p.staff.lastName}\t${emp.toFixed(2)}\t${er.toFixed(2)}\t${(emp + er).toFixed(2)}`)
    })
    lines.push('')
    lines.push(`TOTAL\t\t\t${statutory.length} employees\t${tEmp.toFixed(2)}\t${tEr.toFixed(2)}\t${(tEmp + tEr).toFixed(2)}`)
    return fileResponse(lines.join('\n'), `KWSP_${month}.txt`, 'text/plain')
  }

  // ===== PERKESO SOCSO + EIS Export =====
  if (format === 'socso') {
    const rows: string[] = []
    rows.push('No.,IC Number,Name,SOCSO Number,SOCSO Employee (RM),SOCSO Employer (RM),EIS Employee (RM),EIS Employer (RM),Total (RM)')
    let tSE = 0, tSR = 0, tEE = 0, tER = 0
    statutory.forEach((p, i) => {
      const sE = p.socsoEmployee || 0, sR = p.socsoEmployer || 0, eE = p.eisEmployee || 0, eR = p.eisEmployer || 0
      tSE += sE; tSR += sR; tEE += eE; tER += eR
      rows.push(`${i + 1},${p.staff.icNumber || ''},${p.staff.firstName} ${p.staff.lastName},${p.staff.socsoNumber || ''},${sE.toFixed(2)},${sR.toFixed(2)},${eE.toFixed(2)},${eR.toFixed(2)},${(sE + sR + eE + eR).toFixed(2)}`)
    })
    rows.push('')
    rows.push(`TOTAL,,,,${tSE.toFixed(2)},${tSR.toFixed(2)},${tEE.toFixed(2)},${tER.toFixed(2)},${(tSE + tSR + tEE + tER).toFixed(2)}`)
    return fileResponse(rows.join('\n'), `SOCSO_${month}.csv`, 'text/csv')
  }

  // ===== Bank Salary Disbursement Export =====
  if (format === 'bank') {
    const rows: string[] = []
    rows.push('No.,Bank Name,Account Number,Beneficiary Name,Amount (RM),Reference,IC Number')
    let total = 0
    payrolls.forEach((p, i) => {  // include ALL staff (even OTHER type — they still get paid)
      const net = p.netPay || 0
      total += net
      rows.push(`${i + 1},${p.staff.bankName || ''},${p.staff.bankAccount || ''},${p.staff.firstName} ${p.staff.lastName},${net.toFixed(2)},SALARY ${month} ${p.staff.code || ''},${p.staff.icNumber || ''}`)
    })
    rows.push('')
    rows.push(`TOTAL,,,,${total.toFixed(2)},,`)
    return fileResponse(rows.join('\n'), `BankTransfer_${month}.csv`, 'text/csv')
  }

  // ===== LHDN PCB Tax Submission Export =====
  if (format === 'lhdn') {
    const rows: string[] = []
    rows.push('No.,IC Number,Tax Number,Employee Name,PCB/MTD (RM),EPF Employee (RM),Zakat (RM),Gross Pay (RM)')
    let tPCB = 0, tEPF = 0, tZakat = 0, tGross = 0
    statutory.forEach((p, i) => {
      const pcb = p.pcbTax || 0, epf = p.epfEmployee || 0, zakat = p.zakat || 0, gross = p.grossPay || 0
      tPCB += pcb; tEPF += epf; tZakat += zakat; tGross += gross
      rows.push(`${i + 1},${p.staff.icNumber || ''},${p.staff.taxNumber || ''},${p.staff.firstName} ${p.staff.lastName},${pcb.toFixed(2)},${epf.toFixed(2)},${zakat.toFixed(2)},${gross.toFixed(2)}`)
    })
    rows.push('')
    rows.push(`TOTAL,,,,${tPCB.toFixed(2)},${tEPF.toFixed(2)},${tZakat.toFixed(2)},${tGross.toFixed(2)}`)
    return fileResponse(rows.join('\n'), `LHDN_PCB_${month}.csv`, 'text/csv')
  }

  return NextResponse.json({ error: `Unknown format: ${format}` }, { status: 400 })
}

function fileResponse(content: string, filename: string, contentType: string) {
  return new NextResponse(content, {
    headers: {
      'Content-Type': `${contentType}; charset=utf-8`,
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
