// Use @babel/parser to accurately detect nested function declarations
import { parse } from '@babel/parser'
import fs from 'fs'

const src = fs.readFileSync('/home/z/my-project/src/components/nursing/Settings.tsx', 'utf8')

const ast = parse(src, {
  sourceType: 'module',
  plugins: ['jsx', 'typescript'],
  errorRecovery: true,
})

// Walk the AST. A function declaration is "nested" if its parent is not the Program.
const nested = []
const visit = (node, parent, depth) => {
  if (!node || typeof node !== 'object') return
  if (node.type === 'FunctionDeclaration') {
    const name = node.id?.name || '<anon>'
    if (parent && parent.type !== 'Program') {
      nested.push({ name, line: node.loc?.start.line, parentType: parent.type })
    }
  }
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'type' || key === 'parent') continue
    const child = node[key]
    if (Array.isArray(child)) {
      for (const c of child) {
        if (c && typeof c === 'object' && c.type) visit(c, node, depth + 1)
      }
    } else if (child && typeof child === 'object' && child.type) {
      visit(child, node, depth + 1)
    }
  }
}

visit(ast, null, 0)
if (nested.length === 0) {
  console.log('✓ No nested function declarations — all functions are at module scope')
} else {
  console.log(`✗ Found ${nested.length} nested function declaration(s):`)
  for (const n of nested) console.log(`  Line ${n.line}: function ${n.name} (inside ${n.parentType})`)
}
