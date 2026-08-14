/* eslint-disable */
// Seed product catalog with default billable items
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

const PRODUCTS = [
  // Room & Board
  { name: 'Private Room (Monthly)', description: 'Private room with full board', category: 'ROOM', unitPrice: 4500, unit: 'month' },
  { name: 'Semi-Private Room (Monthly)', description: 'Shared room with full board', category: 'ROOM', unitPrice: 3200, unit: 'month' },
  { name: 'Ward Bed (Monthly)', description: 'Ward-style shared room', category: 'ROOM', unitPrice: 2200, unit: 'month' },
  { name: 'Short Stay (Daily)', description: 'Short-term respite stay per day', category: 'ROOM', unitPrice: 180, unit: 'day' },

  // Care Services
  { name: 'Personal Care Services (Monthly)', description: 'Daily living assistance', category: 'CARE', unitPrice: 1500, unit: 'month' },
  { name: 'Memory Care Supplement', description: 'Specialized dementia care', category: 'CARE', unitPrice: 800, unit: 'month' },
  { name: 'High-Level Care Supplement', description: 'For residents needing extensive assistance', category: 'CARE', unitPrice: 600, unit: 'month' },
  { name: 'Incontinence Supplies (Monthly)', description: 'Briefs, wipes, barriers', category: 'CARE', unitPrice: 150, unit: 'month' },

  // Medication
  { name: 'Medication Management (Monthly)', description: 'Administration and tracking', category: 'MEDICATION', unitPrice: 350, unit: 'month' },
  { name: 'Pharmacy Dispensing Fee', description: 'Per prescription fill', category: 'MEDICATION', unitPrice: 15, unit: 'each' },

  // Therapy
  { name: 'Physiotherapy Session', description: '45-minute physio session', category: 'THERAPY', unitPrice: 75, unit: 'session' },
  { name: 'Occupational Therapy Session', description: '45-minute OT session', category: 'THERAPY', unitPrice: 80, unit: 'session' },
  { name: 'Speech Therapy Session', description: '45-minute speech therapy', category: 'THERAPY', unitPrice: 85, unit: 'session' },
  { name: 'Dietitian Consultation', description: 'Nutrition assessment', category: 'THERAPY', unitPrice: 90, unit: 'session' },
  { name: 'Doctor Visit', description: 'On-site physician visit', category: 'THERAPY', unitPrice: 150, unit: 'session' },

  // Supplies
  { name: 'Wound Care Supplies', description: 'Dressings, tape, solutions', category: 'SUPPLIES', unitPrice: 45, unit: 'each' },
  { name: 'Gloves & PPE (Box)', description: 'Box of 100 gloves', category: 'SUPPLIES', unitPrice: 25, unit: 'each' },
  { name: 'Mobility Aid Rental (Monthly)', description: 'Walker/wheelchair rental', category: 'SUPPLIES', unitPrice: 60, unit: 'month' },

  // Food
  { name: 'Special Diet Supplement (Monthly)', description: 'Supplements for specialized diets', category: 'FOOD', unitPrice: 120, unit: 'month' },
  { name: 'Meal Supplement (Per Day)', description: 'Extra meals or snacks', category: 'FOOD', unitPrice: 12, unit: 'day' },

  // Other
  { name: 'Laundry Service (Monthly)', description: 'Personal laundry', category: 'OTHER', unitPrice: 80, unit: 'month' },
  { name: 'Hairdressing Service', description: 'On-site salon visit', category: 'OTHER', unitPrice: 30, unit: 'session' },
  { name: 'Transport (One-way)', description: 'Medical appointment transport', category: 'OTHER', unitPrice: 50, unit: 'each' },
  { name: 'Activity Fee (Monthly)', description: 'Recreational activities', category: 'OTHER', unitPrice: 40, unit: 'month' },
]

async function main() {
  console.log('Seeding product catalog...')
  let created = 0
  for (const p of PRODUCTS) {
    const existing = await db.product.findUnique({ where: { name: p.name } })
    if (!existing) {
      await db.product.create({ data: p })
      created++
    }
  }
  const total = await db.product.count()
  console.log(`Created ${created} new products. Total: ${total}`)
}

main().catch(console.error).finally(() => db.$disconnect())
