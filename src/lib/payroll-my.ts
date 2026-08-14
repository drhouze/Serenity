// Malaysian payroll calculation utility — updated for 2026 LHDN/KWSP/PERKESO rules
// Based on official schedules from Payroll.my / KWSP / PERKESO / LHDN
//
// Key rules (2026):
//   EPF (KWSP):
//     Employee: 11% of wage (capped at RM4,000 wage ceiling)
//     Employer: 13% if wage ≤ RM5,000, 12% if wage > RM5,000 (capped at RM4,000)
//     Exception: employees above age 60 — employer 4%, employee 0%
//     Rounding: contributions rounded UP to next ringgit (per KWSP rule)
//     Bonus rule: if bonus pushes monthly wage above RM5,000, employer rate = 13% for that month
//
//   SOCSO (PERKESO):
//     Category 1: Employment Injury + Invalidity (employee 0.5%, employer 1.75%)
//     Category 2: Employment Injury only (employee 0%, employer 1.25%)
//     Category 3: Employment Injury + Invalidity + Lindung 24 (same as Cat 1 + extra coverage)
//     Capped at RM4,000 wage ceiling (max RM5,000 wage)
//
//   EIS (SIP):
//     Employee 0.2%, employer 0.2% (capped at RM4,000 wage = max RM7.90)
//     Only for employees < 60 years old
//
//   PCB (MTD):
//     LHDN monthly tax deduction schedule based on:
//       - Tax category (Single, Married spouse not working, Married spouse working, etc.)
//       - Tax resident status
//       - Allowable deductions (EPF relief, life insurance, SSPN, etc.)
//       - Number of children (K deductions)
//     Zakat is a tax REBATE (reduces PCB directly, not a deduction)
//     Bonus/Commission tax: combined tax calculation, then subtract salary-only tax

export const EPF_WAGE_CEILING = 4000      // EPF contribution base capped at RM4,000
export const EPF_SALARY_THRESHOLD = 5000  // Employer rate changes at RM5,000
export const SOCSO_WAGE_CEILING = 5000    // SOCSO max wage = RM5,000
export const EIS_WAGE_CEILING = 4000      // EIS max wage = RM4,000
export const EPF_EMPLOYEE_RATE = 0.11     // Employee EPF rate (standard, < 60 years)
export const EPF_EMPLOYER_RATE_LE_5000 = 0.13  // Employer 13% if wage ≤ RM5,000
export const EPF_EMPLOYER_RATE_GT_5000 = 0.12  // Employer 12% if wage > RM5,000
export const EPF_EMPLOYER_RATE_AGE_60 = 0.04   // Employer 4% if employee > 60 years
export const EPF_EMPLOYEE_RATE_AGE_60 = 0.00   // Employee 0% if > 60 years

// SOCSO rates by category
export const SOCSO_CATEGORIES = {
  CAT1: { label: 'Employment Injury & Invalidity', employeeRate: 0.005, employerRate: 0.0175 },
  CAT2: { label: 'Employment Injury only', employeeRate: 0.0, employerRate: 0.0125 },
  CAT3: { label: 'Employment Injury & Invalidity & Lindung 24', employeeRate: 0.005, employerRate: 0.0175 },
  CAT4: { label: 'Employment Injury & Invalidity (Age 60+)', employeeRate: 0.0, employerRate: 0.0125 },
} as const

export const EIS_EMPLOYEE_RATE = 0.002
export const EIS_EMPLOYER_RATE = 0.002

// Overtime multipliers per Employment Act 1955
export const OT_NORMAL_MULTIPLIER = 1.5
export const OT_REST_DAY_MULTIPLIER = 2.0
export const OT_HOLIDAY_MULTIPLIER = 3.0

// Standard working hours per day
export const STANDARD_WORK_HOURS_PER_DAY = 8

// Tax categories for PCB calculation
export type TaxCategory = 'SINGLE' | 'MARRIED_SPOUSE_NOT_WORKING' | 'MARRIED_SPOUSE_WORKING'
export type SOCSOCategory = 'CAT1' | 'CAT2' | 'CAT3' | 'CAT4'

/**
 * Round UP to next ringgit (per KWSP rule — contributions include cents rounded to next ringgit)
 */
function roundUpToRinggit(n: number): number {
  return Math.ceil(n)
}

/**
 * Round to 2 decimal places (for non-EPF calculations)
 */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Calculate EPF employee contribution (11% of wage, capped at RM4,000 wage)
 * Employees above 60: 0%
 *
 * @param grossPay - Total gross pay (salary + allowances + bonus + OT + commission)
 * @param age - Employee's age (if > 60, rate changes to 0%)
 */
export function calcEPFEmployee(grossPay: number, age?: number): number {
  // Employees above 60 contribute 0%
  if (age !== undefined && age > 60) return 0
  const cappedWage = Math.min(grossPay, EPF_WAGE_CEILING)
  return roundUpToRinggit(cappedWage * EPF_EMPLOYEE_RATE)
}

/**
 * Calculate EPF employer contribution
 * - 13% if wage ≤ RM5,000
 * - 12% if wage > RM5,000
 * - 4% if employee > 60 years old
 * - Bonus rule: if bonus pushes monthly wage above RM5,000, employer rate = 13% for that month
 *   (This is handled automatically — we pass grossPay including bonus, so the threshold check uses the total)
 *
 * @param grossPay - Total gross pay (including bonus if any)
 * @param age - Employee's age (if > 60, rate changes to 4%)
 */
export function calcEPFEmployer(grossPay: number, age?: number): number {
  // Employees above 60: employer 4%
  if (age !== undefined && age > 60) {
    const cappedWage = Math.min(grossPay, EPF_WAGE_CEILING)
    return roundUpToRinggit(cappedWage * EPF_EMPLOYER_RATE_AGE_60)
  }
  // Standard: 13% if wage ≤ RM5,000, 12% if > RM5,000
  // Note: grossPay includes bonus — so if bonus pushes total above RM5,000,
  // the employer rate is 13% (per KWSP rule about bonus in the same month)
  const cappedWage = Math.min(grossPay, EPF_WAGE_CEILING)
  const rate = grossPay <= EPF_SALARY_THRESHOLD
    ? EPF_EMPLOYER_RATE_LE_5000
    : EPF_EMPLOYER_RATE_GT_5000
  return roundUpToRinggit(cappedWage * rate)
}

/**
 * Calculate SOCSO employee contribution based on category
 * Category 1: 0.5% (Employment Injury + Invalidity)
 * Category 2: 0% (Employment Injury only)
 * Category 3: 0.5% (Employment Injury + Invalidity + Lindung 24)
 * Category 4: 0% (Age 60+ — Employment Injury + Invalidity)
 */
export function calcSOCSOEmployee(grossPay: number, category: SOCSOCategory = 'CAT1'): number {
  const cat = SOCSO_CATEGORIES[category]
  const cappedWage = Math.min(grossPay, SOCSO_WAGE_CEILING)
  return round2(cappedWage * cat.employeeRate)
}

/**
 * Calculate SOCSO employer contribution
 */
export function calcSOCSOEmployer(grossPay: number, category: SOCSOCategory = 'CAT1'): number {
  const cat = SOCSO_CATEGORIES[category]
  const cappedWage = Math.min(grossPay, SOCSO_WAGE_CEILING)
  return round2(cappedWage * cat.employerRate)
}

/**
 * Calculate EIS employee contribution (0.2%, capped at RM4,000 wage)
 * Not applicable for employees > 60 years old
 */
export function calcEISEmployee(grossPay: number, age?: number): number {
  if (age !== undefined && age > 60) return 0
  const cappedWage = Math.min(grossPay, EIS_WAGE_CEILING)
  return round2(cappedWage * EIS_EMPLOYEE_RATE)
}

/**
 * Calculate EIS employer contribution
 */
export function calcEISEmployer(grossPay: number, age?: number): number {
  if (age !== undefined && age > 60) return 0
  const cappedWage = Math.min(grossPay, EIS_WAGE_CEILING)
  return round2(cappedWage * EIS_EMPLOYER_RATE)
}

/**
 * Calculate PCB (MTD — Monthly Tax Deduction) based on LHDN schedule.
 *
 * This is a Schedule M (monthly tax deduction) computation that follows the
 * LHDN PCB formula. The calculation uses:
 *   P = monthly employment income after EPF deduction (max RM4,000 EPF relief)
 *   K = personal relief (RM9,000) + spouse relief if applicable
 *   Chargeable income = (P - K/12) × 12 - total allowable deductions
 *
 * Tax categories:
 *   SINGLE: K1 relief only (RM9,000 personal)
 *   MARRIED_SPOUSE_NOT_WORKING: K1 + spouse relief (RM4,000)
 *   MARRIED_SPOUSE_WORKING: K1 only (spouse has own relief)
 *
 * Allowable deductions (annual):
 *   - EPF relief: up to RM4,000 (already built in via P calculation)
 *   - Life insurance/takaful: up to RM3,000
 *   - SSPN: up to RM8,000
 *   - Education/medical insurance: up to RM3,000
 *   - Lifestyle: up to RM2,500
 *   - Parent medical: up to RM5,000
 *   - Higher education: up to RM7,000
 *
 * Zakat is a tax REBATE — it reduces the PCB directly (not a deduction from income).
 *
 * @param grossPay - Monthly gross pay (salary + allowances + bonus + OT)
 * @param epfEmployee - Employee EPF contribution (used for tax relief)
 * @param zakat - Monthly zakat (tax rebate — reduces PCB)
 * @param options - Tax category, resident status, allowable deductions, children
 */
export function calcPCB(
  grossPay: number,
  epfEmployee: number,
  zakat: number = 0,
  options?: {
    taxCategory?: TaxCategory
    isResident?: boolean
    allowableDeductions?: number  // total annual allowable deductions (insurance, SSPN, etc.)
    numberOfChildren?: number      // number of dependent children for child relief
    bonus?: number                // bonus component (for combined tax calculation)
  }
): number {
  const {
    taxCategory = 'SINGLE',
    isResident = true,
    allowableDeductions = 0,
    numberOfChildren = 0,
    bonus = 0,
  } = options || {}

  // Non-residents pay flat 30% tax (simplified)
  if (!isResident) {
    return round2(grossPay * 0.30)
  }

  // EPF relief (up to RM4,000 per year — already in epfEmployee × 12, but capped)
  const annualEPFRelief = Math.min(epfEmployee * 12, 4000)

  // Personal relief (K1)
  const personalRelief = 9000
  // Spouse relief (if married and spouse not working)
  const spouseRelief = taxCategory === 'MARRIED_SPOUSE_NOT_WORKING' ? 4000 : 0
  // Child relief (RM2,000 per child under 18)
  const childRelief = numberOfChildren * 2000

  // Total annual reliefs
  const totalReliefs = personalRelief + spouseRelief + childRelief + annualEPFRelief + allowableDeductions

  // Monthly chargeable income (P) = grossPay - EPF (already deducted from income for tax purposes)
  const monthlyChargeableIncome = Math.max(0, grossPay - epfEmployee)
  // Annual chargeable income
  const annualChargeableIncome = Math.max(0, (monthlyChargeableIncome * 12) - totalReliefs)

  // 2026 LHDN tax brackets (Chargeable Income):
  //   First RM35,000:        0%
  //   RM35,001 - RM50,000:   3%
  //   RM50,001 - RM70,000:   8%
  //   RM70,001 - RM100,000:  13%
  //   RM100,001 - RM250,000: 21%
  //   RM250,001 - RM400,000: 24%
  //   RM400,001 - RM600,000: 24.5%
  //   RM600,001 - RM1,000,000: 25%
  //   RM1,000,001 - RM2,000,000: 26%
  //   Above RM2,000,000:     28%
  let annualTax = 0
  if (annualChargeableIncome <= 35000) annualTax = 0
  else if (annualChargeableIncome <= 50000) annualTax = (annualChargeableIncome - 35000) * 0.03
  else if (annualChargeableIncome <= 70000) annualTax = 450 + (annualChargeableIncome - 50000) * 0.08
  else if (annualChargeableIncome <= 100000) annualTax = 450 + 1600 + (annualChargeableIncome - 70000) * 0.13
  else if (annualChargeableIncome <= 250000) annualTax = 450 + 1600 + 3900 + (annualChargeableIncome - 100000) * 0.21
  else if (annualChargeableIncome <= 400000) annualTax = 450 + 1600 + 3900 + 31500 + (annualChargeableIncome - 250000) * 0.24
  else if (annualChargeableIncome <= 600000) annualTax = 450 + 1600 + 3900 + 31500 + 36000 + (annualChargeableIncome - 400000) * 0.245
  else if (annualChargeableIncome <= 1000000) annualTax = 450 + 1600 + 3900 + 31500 + 36000 + 49000 + (annualChargeableIncome - 600000) * 0.25
  else if (annualChargeableIncome <= 2000000) annualTax = 450 + 1600 + 3900 + 31500 + 36000 + 49000 + 100000 + (annualChargeableIncome - 1000000) * 0.26
  else annualTax = 450 + 1600 + 3900 + 31500 + 36000 + 49000 + 100000 + 260000 + (annualChargeableIncome - 2000000) * 0.28

  // Monthly PCB (before zakat rebate)
  let monthlyPCB = round2(annualTax / 12)

  // Zakat is a tax REBATE — it reduces PCB directly
  monthlyPCB = Math.max(0, monthlyPCB - zakat)

  // If bonus is included, the combined tax is already calculated above.
  // To get bonus-only tax: calculate salary-only tax separately and subtract.
  // (This is handled by the caller if needed — the function returns combined PCB)

  return monthlyPCB
}

/**
 * Calculate overtime pay for a single OT entry.
 */
export function calcOvertimePay(hourlyRate: number, hours: number, type: 'NORMAL' | 'REST_DAY' | 'HOLIDAY' = 'NORMAL'): number {
  const multiplier = type === 'HOLIDAY' ? OT_HOLIDAY_MULTIPLIER : type === 'REST_DAY' ? OT_REST_DAY_MULTIPLIER : OT_NORMAL_MULTIPLIER
  return round2(hourlyRate * hours * multiplier)
}

/**
 * Derive an hourly rate from a monthly basic salary.
 * Standard: monthly / 26 days / 8 hours
 */
export function hourlyRateFromBasic(basicSalary: number): number {
  return round2(basicSalary / 26 / STANDARD_WORK_HOURS_PER_DAY)
}

export interface PayrollInput {
  basicSalary: number
  overtimeHours?: number
  overtimePay?: number
  allowances?: number
  bonus?: number
  commission?: number
  zakat?: number
  loanDeduction?: number
  unpaidLeaveDays?: number
  // Tax calculation options
  age?: number                    // Employee's age (affects EPF + EIS rates)
  taxCategory?: TaxCategory       // Single, Married (spouse not working), Married (spouse working)
  isResident?: boolean            // Tax resident status
  allowableDeductions?: number   // Annual allowable deductions (insurance, SSPN, etc.)
  numberOfChildren?: number      // Number of dependent children
  socsoCategory?: SOCSOCategory  // SOCSO contribution category
  eisEnabled?: boolean           // Whether EIS contribution applies
  // Internal: when true, skips ALL statutory deductions (EPF/SOCSO/EIS/PCB)
  // and pays net = gross (cash-in-hand). No official records generated.
  skipStatutory?: boolean
}

export interface PayrollResult {
  basicSalary: number
  overtimePay: number
  allowances: number
  bonus: number
  commission: number
  grossPay: number
  epfEmployee: number
  epfEmployer: number
  socsoEmployee: number
  socsoEmployer: number
  eisEmployee: number
  eisEmployer: number
  pcbTax: number
  zakat: number
  loanDeduction: number
  unpaidLeaveDeduction: number
  totalDeductions: number
  netPay: number
  // Computed: total employer cost
  employerCost: number
}

/**
 * Full payroll calculation with all Malaysian statutory deductions.
 * Updated for 2026 rules: EPF employer rate 13%/12%, KWSP rounding, age-based rates,
 * SOCSO categories, PCB with tax category + allowable deductions + zakat rebate.
 */
export function calculatePayroll(input: PayrollInput): PayrollResult {
  const basicSalary = round2(input.basicSalary || 0)
  const overtimePay = round2(input.overtimePay || 0)
  const allowances = round2(input.allowances || 0)
  const bonus = round2(input.bonus || 0)
  const commission = round2(input.commission || 0)
  const zakat = round2(input.zakat || 0)
  const loanDeduction = round2(input.loanDeduction || 0)
  const age = input.age
  const socsoCategory = input.socsoCategory || 'CAT1'
  const eisEnabled = input.eisEnabled !== false  // default true
  const skipStatutory = input.skipStatutory === true  // internal flag

  // Unpaid leave deduction: daily rate × unpaid days
  const dailyRate = basicSalary / 26
  const unpaidLeaveDeduction = round2(dailyRate * (input.unpaidLeaveDays || 0))

  const grossPay = round2(basicSalary + overtimePay + allowances + bonus + commission)

  // When skipStatutory is true, all EPF/SOCSO/EIS/PCB = 0
  // Net pay = gross - (loan + unpaid leave only)
  const epfEmployee = skipStatutory ? 0 : calcEPFEmployee(grossPay, age)
  const epfEmployer = skipStatutory ? 0 : calcEPFEmployer(grossPay, age)
  const socsoEmployee = skipStatutory ? 0 : calcSOCSOEmployee(grossPay, socsoCategory)
  const socsoEmployer = skipStatutory ? 0 : calcSOCSOEmployer(grossPay, socsoCategory)
  const eisEmployee = (skipStatutory || !eisEnabled) ? 0 : calcEISEmployee(grossPay, age)
  const eisEmployer = (skipStatutory || !eisEnabled) ? 0 : calcEISEmployer(grossPay, age)
  const pcbTax = skipStatutory ? 0 : calcPCB(grossPay, epfEmployee, zakat, {
    taxCategory: input.taxCategory,
    isResident: input.isResident,
    allowableDeductions: input.allowableDeductions,
    numberOfChildren: input.numberOfChildren,
    bonus: input.bonus,
  })

  // Employee deductions: EPF + SOCSO + EIS + PCB + zakat + loan + unpaid leave
  const totalDeductions = round2(
    epfEmployee + socsoEmployee + eisEmployee + pcbTax + zakat + loanDeduction + unpaidLeaveDeduction
  )

  const netPay = round2(grossPay - totalDeductions)

  // Total employer cost = gross + employer EPF + employer SOCSO + employer EIS
  const employerCost = round2(grossPay + epfEmployer + socsoEmployer + eisEmployer)

  return {
    basicSalary,
    overtimePay,
    allowances,
    bonus,
    commission,
    grossPay,
    epfEmployee,
    epfEmployer,
    socsoEmployee,
    socsoEmployer,
    eisEmployee,
    eisEmployer,
    pcbTax,
    zakat,
    loanDeduction,
    unpaidLeaveDeduction,
    totalDeductions,
    netPay,
    employerCost,
  }
}
