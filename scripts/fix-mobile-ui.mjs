// Auto-fix mobile UI issues across all .tsx files:
// 1. Add flex-wrap to flex containers with gap + justify-end/justify-between that don't have it
// 2. Add flex-wrap to flex containers with gap-1 flex-shrink-0 (button rows)
import fs from 'fs'
import path from 'path'

const dir = '/home/z/my-project/src/components/nursing'
const files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx'))

let totalFixed = 0

for (const f of files) {
  const filePath = path.join(dir, f)
  let src = fs.readFileSync(filePath, 'utf8')
  let changed = false

  // Fix 1: "flex justify-end gap-2" → "flex flex-wrap justify-end gap-2"
  // Match: className="flex justify-end gap-2..." (without flex-wrap or flex-col already present)
  src = src.replace(
    /className="flex (?!flex-wrap|flex-col)(justify-end gap-2[^"]*)"/g,
    (match, rest) => {
      changed = true
      return `className="flex flex-wrap ${rest}"`
    }
  )

  // Fix 2: "flex justify-between gap-2" → "flex flex-wrap justify-between gap-2"
  src = src.replace(
    /className="flex (?!flex-wrap|flex-col)(justify-between[^"]*gap-2[^"]*)"/g,
    (match, rest) => {
      changed = true
      return `className="flex flex-wrap ${rest}"`
    }
  )
  // Also: "flex items-center justify-between gap-2" pattern
  src = src.replace(
    /className="flex (?!flex-wrap|flex-col)(items-center justify-between gap-2[^"]*)"/g,
    (match, rest) => {
      changed = true
      return `className="flex flex-wrap ${rest}"`
    }
  )
  // Also: "flex items-start justify-between gap-2"
  src = src.replace(
    /className="flex (?!flex-wrap|flex-col)(items-start justify-between gap-2[^"]*)"/g,
    (match, rest) => {
      changed = true
      return `className="flex flex-wrap ${rest}"`
    }
  )

  // Fix 3: "flex gap-1 flex-shrink-0" → "flex flex-wrap gap-1 flex-shrink-0"
  src = src.replace(
    /className="flex (?!flex-wrap|flex-col)(gap-1 flex-shrink-0[^"]*)"/g,
    (match, rest) => {
      changed = true
      return `className="flex flex-wrap ${rest}"`
    }
  )

  // Fix 4: "flex items-center gap-2 flex-shrink-0" → "flex flex-wrap items-center gap-2 flex-shrink-0"
  src = src.replace(
    /className="flex (?!flex-wrap|flex-col)(items-center gap-2 flex-shrink-0[^"]*)"/g,
    (match, rest) => {
      changed = true
      return `className="flex flex-wrap ${rest}"`
    }
  )

  // Fix 5: "flex items-center gap-1 flex-shrink-0" → same with flex-wrap
  src = src.replace(
    /className="flex (?!flex-wrap|flex-col)(items-center gap-1 flex-shrink-0[^"]*)"/g,
    (match, rest) => {
      changed = true
      return `className="flex flex-wrap ${rest}"`
    }
  )

  if (changed) {
    fs.writeFileSync(filePath, src)
    console.log(`  ✓ ${f}: fixed`)
    totalFixed++
  }
}

console.log(`\nTotal: ${totalFixed} files fixed`)
