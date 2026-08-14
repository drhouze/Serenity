// Find components that have a refreshKey state but don't use it in useFetch
import { parse } from '@babel/parser'
import fs from 'fs'
import path from 'path'

const dir = '/home/z/my-project/src/components/nursing'
const files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx'))

for (const f of files) {
  const src = fs.readFileSync(path.join(dir, f), 'utf8')
  
  // Quick check: does the file have both refreshKey + useFetch?
  if (!src.includes('refreshKey') || !src.includes('useFetch')) continue
  
  // Check if refreshKey is used in the useFetch URL
  const hasRefreshKeyInUrl = src.match(/useFetch.*\$\{refreshKey\}|useFetch.*refreshKey|_t=.*refreshKey|_v=.*refreshKey/) || src.includes('refetch()')
  
  if (!hasRefreshKeyInUrl) {
    // Check if refetch is destructured from useFetch
    const hasRefetch = src.match(/const\s*\{[^}]*refetch[^}]*\}\s*=\s*useFetch/)
    
    // Check if triggerRefresh calls refetch
    const triggerCallsRefetch = src.match(/triggerRefresh.*refetch|refetch.*triggerRefresh/) || 
      (src.includes('refetch') && src.includes('triggerRefresh') && src.match(/triggerRefresh\s*=\s*\(\)\s*=>\s*\{?\s*refetch/))
    
    if (!hasRefetch && !triggerCallsRefetch) {
      console.log(`✗ ${f}: has refreshKey state but NEVER uses it in useFetch URL or calls refetch`)
    } else if (hasRefetch && !triggerCallsRefetch) {
      console.log(`⚠ ${f}: has refetch from useFetch but triggerRefresh doesn't call it`)
    }
  }
}
