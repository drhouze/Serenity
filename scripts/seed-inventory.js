/* eslint-disable */
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

const ITEMS = [
  // Medical
  { name: 'Disposable Gloves (Box of 100)', category: 'MEDICAL', sku: 'MED-GLV-001', unit: 'box', currentStock: 25, reorderLevel: 10, reorderQty: 50, location: 'Store Room A - Shelf 1', unitCost: 25, supplier: 'MediSupply Co.' },
  { name: 'Surgical Masks (Box of 50)', category: 'MEDICAL', sku: 'MED-MSK-001', unit: 'box', currentStock: 8, reorderLevel: 10, reorderQty: 30, location: 'Store Room A - Shelf 1', unitCost: 15, supplier: 'MediSupply Co.' },
  { name: 'Alcohol Swabs (Box of 200)', category: 'MEDICAL', sku: 'MED-ALC-001', unit: 'box', currentStock: 40, reorderLevel: 15, reorderQty: 50, location: 'Store Room A - Shelf 2', unitCost: 8, supplier: 'MediSupply Co.' },
  { name: 'Bandages (Assorted)', category: 'MEDICAL', sku: 'MED-BND-001', unit: 'box', currentStock: 18, reorderLevel: 5, reorderQty: 20, location: 'Store Room A - Shelf 2', unitCost: 12, supplier: 'MediSupply Co.' },
  { name: 'Incontinence Briefs (Large)', category: 'MEDICAL', sku: 'MED-INC-L', unit: 'pack', currentStock: 12, reorderLevel: 15, reorderQty: 40, location: 'Store Room A - Shelf 3', unitCost: 18, supplier: 'FreshFoods Inc.' },
  { name: 'Incontinence Briefs (Medium)', category: 'MEDICAL', sku: 'MED-INC-M', unit: 'pack', currentStock: 22, reorderLevel: 15, reorderQty: 40, location: 'Store Room A - Shelf 3', unitCost: 18, supplier: 'FreshFoods Inc.' },
  { name: 'Wound Dressing Kit', category: 'MEDICAL', sku: 'MED-WND-001', unit: 'each', currentStock: 30, reorderLevel: 10, reorderQty: 30, location: 'Store Room A - Shelf 4', unitCost: 4.5, supplier: 'MediSupply Co.' },
  { name: 'Blood Pressure Cuffs', category: 'MEDICAL', sku: 'MED-BP-001', unit: 'each', currentStock: 6, reorderLevel: 3, reorderQty: 5, location: 'Nurse Station', unitCost: 45, supplier: 'TechMed Ltd.' },
  { name: 'Insulin Syringes', category: 'MEDICAL', sku: 'MED-INS-001', unit: 'box', currentStock: 14, reorderLevel: 8, reorderQty: 20, location: 'Store Room A - Shelf 5 (Locked)', unitCost: 22, supplier: 'Local Pharmacy' },
  { name: 'Hand Sanitizer (1L)', category: 'MEDICAL', sku: 'MED-HS-001', unit: 'bottle', currentStock: 35, reorderLevel: 10, reorderQty: 30, location: 'Various stations', unitCost: 6, supplier: 'MediSupply Co.' },

  // Food
  { name: 'Ensure Plus (Vanilla)', category: 'FOOD', sku: 'FOOD-ENS-V', unit: 'bottle', currentStock: 48, reorderLevel: 24, reorderQty: 96, location: 'Kitchen Pantry', unitCost: 3.5, supplier: 'FreshFoods Inc.' },
  { name: 'Ensure Plus (Chocolate)', category: 'FOOD', sku: 'FOOD-ENS-C', unit: 'bottle', currentStock: 36, reorderLevel: 24, reorderQty: 96, location: 'Kitchen Pantry', unitCost: 3.5, supplier: 'FreshFoods Inc.' },
  { name: 'Thickened Water (Nectar)', category: 'FOOD', sku: 'FOOD-TW-N', unit: 'pack', currentStock: 9, reorderLevel: 12, reorderQty: 24, location: 'Kitchen Pantry', unitCost: 14, supplier: 'FreshFoods Inc.' },
  { name: 'Pureed Food Trays', category: 'FOOD', sku: 'FOOD-PUR-001', unit: 'pack', currentStock: 20, reorderLevel: 10, reorderQty: 30, location: 'Kitchen Freezer', unitCost: 8, supplier: 'FreshFoods Inc.' },

  // Cleaning
  { name: 'Disinfectant Spray', category: 'CLEANING', sku: 'CLN-DIS-001', unit: 'bottle', currentStock: 16, reorderLevel: 8, reorderQty: 24, location: 'Janitor Closet', unitCost: 7, supplier: 'Office Depot' },
  { name: 'Laundry Detergent (10L)', category: 'CLEANING', sku: 'CLN-LD-001', unit: 'bottle', currentStock: 5, reorderLevel: 5, reorderQty: 10, location: 'Laundry Room', unitCost: 28, supplier: 'Office Depot' },
  { name: 'Toilet Paper (Roll)', category: 'CLEANING', sku: 'CLN-TP-001', unit: 'pack', currentStock: 60, reorderLevel: 20, reorderQty: 100, location: 'Store Room B', unitCost: 0.8, supplier: 'Office Depot' },
  { name: 'Hand Soap (5L)', category: 'CLEANING', sku: 'CLN-HS-001', unit: 'bottle', currentStock: 11, reorderLevel: 5, reorderQty: 15, location: 'Janitor Closet', unitCost: 12, supplier: 'Office Depot' },

  // Office
  { name: 'Printer Paper (A4)', category: 'OFFICE', sku: 'OFF-PP-001', unit: 'box', currentStock: 8, reorderLevel: 4, reorderQty: 10, location: 'Reception Office', unitCost: 35, supplier: 'Office Depot' },
  { name: 'Pens (Blue)', category: 'OFFICE', sku: 'OFF-PN-001', unit: 'box', currentStock: 3, reorderLevel: 5, reorderQty: 10, location: 'Reception Office', unitCost: 8, supplier: 'Office Depot' },
  { name: 'File Folders', category: 'OFFICE', sku: 'OFF-FF-001', unit: 'box', currentStock: 15, reorderLevel: 5, reorderQty: 10, location: 'Reception Office', unitCost: 18, supplier: 'Office Depot' },

  // Other
  { name: 'Adult Wipes (Pack of 80)', category: 'OTHER', sku: 'OTH-AW-001', unit: 'pack', currentStock: 28, reorderLevel: 12, reorderQty: 30, location: 'Store Room B', unitCost: 9, supplier: 'FreshFoods Inc.' },
  { name: 'Disposable Bed Pads', category: 'OTHER', sku: 'OTH-BP-001', unit: 'pack', currentStock: 7, reorderLevel: 10, reorderQty: 25, location: 'Store Room B', unitCost: 11, supplier: 'MediSupply Co.' },
]

async function main() {
  console.log('Seeding inventory...')
  let created = 0
  for (const item of ITEMS) {
    const existing = await db.inventoryItem.findFirst({ where: { name: item.name } })
    if (!existing) {
      await db.inventoryItem.create({
        data: {
          ...item,
          lastCountDate: new Date(),
          active: true,
        }
      })
      created++
    }
  }
  const total = await db.inventoryItem.count()
  console.log(`Created ${created} items. Total: ${total}`)
}

main().catch(console.error).finally(() => db.$disconnect())
