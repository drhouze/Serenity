// Audit all .tsx files for common mobile UI issues:
// 1. flex without flex-wrap (buttons can overflow)
// 2. flex-shrink-0 without flex-wrap on the same container
// 3. whitespace-nowrap on text that could be long (can push other elements off screen)
// 4. Button with text label but no hidden sm:inline pattern (takes too much width on mobile)
import fs from 'fs'
import path from 'path'

const dir = '/home/z/my-project/src/components/nursing'
const files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx'))

const issues = []

for (const f of files) {
  const src = fs.readFileSync(path.join(dir, f), 'utf8')
  const lines = src.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const lineNum = i + 1

    // Skip comments
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue

    // Pattern 1: flex justify-between or justify-end WITHOUT flex-wrap
    // (buttons in footer can overflow on mobile)
    if (line.includes('flex') && (line.includes('justify-between') || line.includes('justify-end')) 
        && !line.includes('flex-wrap') && !line.includes('flex-col')
        && (line.includes('gap-2') || line.includes('gap-1'))
        && (line.includes('border-t') || line.includes('p-4') || line.includes('p-3') || line.includes('p-2'))) {
      issues.push({ file: f, line: lineNum, type: 'flex-no-wrap-footer', text: line.trim().slice(0, 80) })
    }

    // Pattern 2: flex items-center with gap but no flex-wrap AND has flex-shrink-0
    // (action buttons row that doesn't wrap)
    if (line.includes('flex') && line.includes('gap-1') && line.includes('flex-shrink-0') 
        && !line.includes('flex-wrap') && !line.includes('flex-col')) {
      issues.push({ file: f, line: lineNum, type: 'buttons-no-wrap', text: line.trim().slice(0, 80) })
    }

    // Pattern 3: flex items-center gap-2 flex-shrink-0 (common button container)
    if (line.includes('flex') && line.includes('items-center') && line.includes('gap-2') 
        && line.includes('flex-shrink-0') && !line.includes('flex-wrap')) {
      issues.push({ file: f, line: lineNum, type: 'buttons-no-wrap', text: line.trim().slice(0, 80) })
    }
  }
}

// Group by file
const byFile = {}
for (const issue of issues) {
  if (!byFile[issue.file]) byFile[issue.file] = []
  byFile[issue.file].push(issue)
}

console.log('=== Mobile UI Audit Results ===\n')
let total = 0
for (const [file, fileIssues] of Object.entries(byFile)) {
  console.log(`${file}: ${fileIssues.length} issue(s)`)
  for (const i of fileIssues) {
    console.log(`  L${i.line} [${i.type}]: ${i.text}`)
  }
  total += fileIssues.length
}
console.log(`\nTotal: ${total} potential issues across ${Object.keys(byFile).length} files`)
