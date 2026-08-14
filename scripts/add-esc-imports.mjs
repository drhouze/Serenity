import fs from 'fs'
const files = [
  'src/components/nursing/Accounting.tsx',
  'src/components/nursing/CsvUpload.tsx',
  'src/components/nursing/Finance.tsx',
  'src/components/nursing/Inventory.tsx',
  'src/components/nursing/Medications.tsx',
  'src/components/nursing/Messages.tsx',
  'src/components/nursing/MobileCareRounds.tsx',
  'src/components/nursing/ProductCatalog.tsx',
  'src/components/nursing/Residents.tsx',
  'src/components/nursing/Rooms.tsx',
  'src/components/nursing/Settings.tsx',
  'src/components/nursing/Staff.tsx',
  'src/components/nursing/UserManagement.tsx',
  'src/components/nursing/UserProfile.tsx',
  'src/components/nursing/Visits.tsx',
]
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  if (src.includes("import { useEscClose } from './useEscClose'")) {
    console.log(`  ✓ ${f}: already has import`)
    continue
  }
  // Add after the first import line
  const lines = src.split('\n')
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('import ')) {
      lines.splice(i + 1, 0, "import { useEscClose } from './useEscClose'")
      break
    }
  }
  fs.writeFileSync(f, lines.join('\n'))
  console.log(`  ✓ ${f}: import added`)
}
