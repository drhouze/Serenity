// Replace all small "×" close buttons with a bigger, mobile-friendly version
import fs from 'fs'
import path from 'path'

const dir = '/home/z/my-project/src/components/nursing'
const files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx'))

// Old pattern: <Button variant="ghost" size="sm" onClick={onClose}>×</Button>
// New pattern: <Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0">×</Button>
//
// Changes:
// - Removed size="sm" (was making it tiny)
// - Added h-9 w-9 p-0 (bigger touch target: 36×36px — Apple's minimum recommended)
// - Added text-xl leading-none (bigger × symbol)
// - Added rounded-full (circular — looks like a proper close button)
// - Added flex-shrink-0 (won't be squeezed on mobile)
// - Added hover:bg-muted (visible hover state)

const OLD = `<Button variant="ghost" size="sm" onClick={onClose}>×</Button>`
const NEW = `<Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0" aria-label="Close">×</Button>`

let totalReplaced = 0
for (const f of files) {
  const filePath = path.join(dir, f)
  const src = fs.readFileSync(filePath, 'utf8')
  const count = (src.match(new RegExp(OLD.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length
  if (count > 0) {
    const newSrc = src.split(OLD).join(NEW)
    fs.writeFileSync(filePath, newSrc)
    totalReplaced += count
    console.log(`  ✓ ${f}: replaced ${count} close button(s)`)
  }
}
console.log(`\nTotal: ${totalReplaced} close buttons upgraded across ${files.length} files`)
