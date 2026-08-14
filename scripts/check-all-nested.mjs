import { parse } from '@babel/parser'
import fs from 'fs'
import path from 'path'

function checkFile(filePath) {
  const src = fs.readFileSync(filePath, 'utf8')
  let ast
  try {
    ast = parse(src, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
      errorRecovery: true,
    })
  } catch (e) {
    return { file: filePath, error: e.message }
  }
  const nested = []
  const visit = (node, parent) => {
    if (!node || typeof node !== 'object') return
    if (node.type === 'FunctionDeclaration') {
      const name = node.id?.name || '<anon>'
      // Skip the export wrapper — `export function X` is fine
      if (parent && parent.type !== 'Program' && parent.type !== 'ExportNamedDeclaration') {
        nested.push({ name, line: node.loc?.start.line, parentType: parent.type })
      }
    }
    for (const key of Object.keys(node)) {
      if (['loc', 'start', 'end', 'type', 'parent', 'range', 'leadingComments', 'trailingComments'].includes(key)) continue
      const child = node[key]
      if (Array.isArray(child)) {
        for (const c of child) {
          if (c && typeof c === 'object' && c.type) visit(c, node)
        }
      } else if (child && typeof child === 'object' && child.type) {
        visit(child, node)
      }
    }
  }
  visit(ast, null)
  return { file: filePath, nested, error: null }
}

// Scan all .tsx files in src/components/nursing
const dir = '/home/z/my-project/src/components/nursing'
const files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx'))
let totalIssues = 0
for (const f of files) {
  const result = checkFile(path.join(dir, f))
  if (result.error) {
    console.log(`✗ ${f}: PARSE ERROR — ${result.error.slice(0, 100)}`)
    totalIssues++
  } else if (result.nested.length > 0) {
    console.log(`✗ ${f}: ${result.nested.length} nested function declaration(s):`)
    for (const n of result.nested) console.log(`    Line ${n.line}: function ${n.name} (inside ${n.parentType})`)
    totalIssues += result.nested.length
  } else {
    console.log(`✓ ${f}`)
  }
}
console.log()
console.log(totalIssues === 0 ? '✓ All files clean — no nested function declarations' : `✗ ${totalIssues} total issue(s) found`)
