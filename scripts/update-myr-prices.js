/* eslint-disable */
// Update product prices to MYR (Malaysian Ringgit) realistic values
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

const MYR_PRICES = {
  'Private Room (Monthly)': 4500,
  'Semi-Private Room (Monthly)': 3200,
  'Ward Bed (Monthly)': 2200,
  'Short Stay (Daily)': 180,
  'Personal Care Services (Monthly)': 1500,
  'Memory Care Supplement': 800,
  'High-Level Care Supplement': 600,
  'Incontinence Supplies (Monthly)': 150,
  'Medication Management (Monthly)': 350,
  'Pharmacy Dispensing Fee': 15,
  'Physiotherapy Session': 75,
  'Occupational Therapy Session': 80,
  'Speech Therapy Session': 85,
  'Dietitian Consultation': 90,
  'Doctor Visit': 150,
  'Wound Care Supplies': 45,
  'Gloves & PPE (Box)': 25,
  'Mobility Aid Rental (Monthly)': 60,
  'Special Diet Supplement (Monthly)': 120,
  'Meal Supplement (Per Day)': 12,
  'Laundry Service (Monthly)': 80,
  'Hairdressing Service': 30,
  'Transport (One-way)': 50,
  'Activity Fee (Monthly)': 40,
}

async function main() {
  console.log('Updating product prices to MYR...')
  let updated = 0
  for (const [name, price] of Object.entries(MYR_PRICES)) {
    const r = await db.product.updateMany({ where: { name }, data: { unitPrice: price } })
    if (r.count > 0) updated++
  }
  console.log(`Updated ${updated} product prices to MYR`)
}

main().catch(console.error).finally(() => db.$disconnect())
