// AST-based patcher: adds `useEscClose(onClose)` to every dialog function
// that has an `onClose` prop. Also adds the import.
import { parse } from '@babel/parser'
import fs from 'fs'
import path from 'path'

const dir = '/home/z/my-project/src/components/nursing'
const files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx'))

let totalPatched = 0
let totalSkipped = 0
let totalFiles = 0

for (const f of files) {
  const filePath = path.join(dir, f)
  const src = fs.readFileSync(filePath, 'utf8')

  // Parse the file
  let ast
  try {
    ast = parse(src, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
      errorRecovery: true,
    })
  } catch (e) {
    console.log(`✗ ${f}: parse error — ${e.message.slice(0, 80)}`)
    continue
  }

  // Find all FunctionDeclaration nodes that have `onClose` in their params
  const insertions = []  // { line, col, alreadyHasImport }

  // Walk the AST manually (babel-walk may not be available)
  const visit = (node) => {
    if (!node || typeof node !== 'object') return
    if (node.type === 'FunctionDeclaration') {
      const params = node.params || []
      let hasOnClose = false
      for (const p of params) {
        // Pattern: { onClose, ... } (ObjectPattern)
        if (p.type === 'ObjectPattern') {
          for (const prop of p.properties) {
            if (prop.type === 'ObjectProperty' && prop.key?.name === 'onClose') {
              hasOnClose = true
              break
            }
          }
        }
        // Pattern: { onClose }: any (TypeScript annotation)
        if (p.type === 'AssignmentPattern' && p.left?.type === 'ObjectPattern') {
          for (const prop of p.left.properties) {
            if (prop.type === 'ObjectProperty' && prop.key?.name === 'onClose') {
              hasOnClose = true
              break
            }
          }
        }
      }
      if (hasOnClose) {
        // Get the body start location (after the opening `{`)
        const body = node.body
        if (body && body.type === 'BlockStatement' && body.start) {
          // Find the position right after `{`
          // body.start is the index of `{`, so body.start + 1 is right after it
          // We also need to check if useEscClose is already in the body
          const bodyText = src.slice(body.start, body.end)
          if (!bodyText.includes('useEscClose')) {
            insertions.push(body.start + 1)  // position right after `{`
          }
        }
      }
    }
    // Recurse into children
    for (const key of Object.keys(node)) {
      if (['loc', 'start', 'end', 'type', 'parent', 'range', 'leadingComments', 'trailingComments'].includes(key)) continue
      const child = node[key]
      if (Array.isArray(child)) {
        for (const c of child) {
          if (c && typeof c === 'object' && c.type) visit(c)
        }
      } else if (child && typeof child === 'object' && child.type) {
        visit(child)
      }
    }
  }
  visit(ast)

  if (insertions.length === 0) {
    continue
  }

  totalFiles++
  // Sort insertions in reverse order (so we can insert from end to start
  // without shifting positions)
  insertions.sort((a, b) => b - a)

  // Build the new source by inserting `useEscClose(onClose)` at each position
  let newSrc = src
  for (const pos of insertions) {
    // Insert right after the `{`, on a new line with proper indentation
    newSrc = newSrc.slice(0, pos) + '\n  useEscClose(onClose)' + newSrc.slice(pos)
  }

  // Add the import if not present
  if (!newSrc.includes('useEscClose')) {
    // This shouldn't happen since we just inserted useEscClose calls,
    // but we need the import. Add it after the first import statement.
    const importMatch = newSrc.match(/^(import .+;\n)/m)
    if (importMatch) {
      const insertPos = importMatch.index + importMatch[0].length
      newSrc = newSrc.slice(0, insertPos) + "import { useEscClose } from './useEscClose'\n" + newSrc.slice(insertPos)
    } else {
      // No imports — add at the very top
      newSrc = "import { useEscClose } from './useEscClose'\n" + newSrc
    }
  } else {
    // Already has useEscClose in the text — check if the import exists
    if (!newSrc.includes("import { useEscClose }") && !newSrc.includes("import {useEscClose}")) {
      const importMatch = newSrc.match(/^(import .+;\n)/m)
      if (importMatch) {
        const insertPos = importMatch.index + importMatch[0].length
        newSrc = newSrc.slice(0, insertPos) + "import { useEscClose } from './useEscClose'\n" + newSrc.slice(insertPos)
      }
    }
  }

  fs.writeFileSync(filePath, newSrc)
  console.log(`✓ ${f}: patched ${insertions.length} dialog(s)`)
  totalPatched += insertions.length
}

console.log()
console.log(`Total: ${totalPatched} dialogs patched across ${totalFiles} files`)
