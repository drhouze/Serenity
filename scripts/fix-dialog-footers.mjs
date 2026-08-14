// Fix dialog footers: add flex-wrap so Cancel + Submit don't overflow on mobile
import fs from 'fs'
import path from 'path'

const dir = '/home/z/my-project/src/components/nursing'
const files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx'))

// Old: <div className="flex justify-end gap-2 p-4 border-t ...">
// New: <div className="flex flex-wrap justify-end gap-2 p-4 border-t ...">
// The flex-wrap ensures buttons wrap to the next line if they don't fit
// on a narrow mobile screen, instead of overflowing or being squeezed.

let totalFixed = 0
for (const f of files) {
  const filePath = path.join(dir, f)
  let src = fs.readFileSync(filePath, 'utf8')
  
  // Match patterns like: flex justify-end gap-2 p-4 border-t
  // or: flex justify-end gap-2 p-4 border-t flex-shrink-0
  // Add flex-wrap if not already present
  const pattern = /className="flex (?!flex-wrap)(justify-end gap-2 p-4 border-t[^"]*)"/g
  const matches = src.match(pattern)
  if (matches) {
    src = src.replace(pattern, (match, p1) => {
      return `className="flex flex-wrap ${p1}"`
    })
    fs.writeFileSync(filePath, src)
    totalFixed += matches.length
    console.log(`  ✓ ${f}: fixed ${matches.length} footer(s)`)
  }
}
console.log(`\nTotal: ${totalFixed} dialog footers fixed`)
