import fs from 'fs'
import path from 'path'
const dir = '/home/z/my-project/src/components/nursing'
const files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx'))
let total = 0
for (const f of files) {
  const filePath = path.join(dir, f)
  let src = fs.readFileSync(filePath, 'utf8')
  // Add flex-wrap to justify-between footers that don't have it
  const pattern = /className="flex (?!flex-wrap)(justify-between items-center gap-2 p-4 border-t[^"]*)"/g
  const matches = src.match(pattern)
  if (matches) {
    src = src.replace(pattern, (m, p1) => `className="flex flex-wrap ${p1}"`)
    fs.writeFileSync(filePath, src)
    total += matches.length
    console.log(`  ✓ ${f}: fixed ${matches.length} footer(s)`)
  }
}
console.log(`\nTotal: ${total} justify-between footers fixed`)
