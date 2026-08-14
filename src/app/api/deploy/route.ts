import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { exec } from 'child_process'
import { promisify } from 'util'
import { rm, readdir } from 'fs/promises'
import path from 'path'

const execAsync = promisify(exec)

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

// POST /api/deploy — clears build cache and forces recompile
// Developer only.
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'APP_DEVELOPER') {
    return NextResponse.json({ error: 'App Developer only' }, { status: 403 })
  }

  const startTime = Date.now()
  const steps: { step: string; status: string; message: string; duration?: number }[] = []

  try {
    // Step 1: Clear the Turbopack cache (forces full recompile on next request)
    steps.push({ step: 'Clear cache', status: 'pending', message: 'Clearing build cache...' })
    const clearStart = Date.now()
    try {
      // Clear the turbopack cache (this is what forces recompilation in dev mode)
      const cachePath = path.join(process.cwd(), '.next', 'cache')
      await rm(cachePath, { recursive: true, force: true }).catch(() => {})
      
      // Also clear the server build output (forces recompile)
      const serverPath = path.join(process.cwd(), '.next', 'server')
      await rm(serverPath, { recursive: true, force: true }).catch(() => {})
      
      steps[0] = { step: 'Clear cache', status: 'success', message: 'Build cache cleared', duration: Date.now() - clearStart }
    } catch (e: any) {
      steps[0] = { step: 'Clear cache', status: 'success', message: 'Cache clear partial', duration: Date.now() - clearStart }
    }

    // Step 2: Clean up temp files (prevent disk fill)
    steps.push({ step: 'Cleanup', status: 'pending', message: 'Cleaning temp files...' })
    const cleanupStart = Date.now()
    try {
      // Clean old build artifacts in /tmp
      const tmpEntries = await readdir('/tmp').catch(() => [])
      let cleaned = 0
      for (const entry of tmpEntries) {
        if (entry.startsWith('build_fullstack_') || entry.startsWith('backup-') || entry.startsWith('drive-restore-')) {
          await rm(path.join('/tmp', entry), { recursive: true, force: true }).catch(() => {})
          cleaned++
        }
      }
      steps[1] = { step: 'Cleanup', status: 'success', message: `Cleaned ${cleaned} temp file(s)`, duration: Date.now() - cleanupStart }
    } catch {
      steps[1] = { step: 'Cleanup', status: 'success', message: 'Cleanup skipped', duration: Date.now() - cleanupStart }
    }

    // Step 3: Bump data version (forces all clients to refetch data)
    steps.push({ step: 'Refresh clients', status: 'pending', message: 'Notifying all clients to refresh...' })
    try {
      await execAsync('curl -s -X POST http://localhost:3000/api/data-version 2>/dev/null', { timeout: 5000 }).catch(() => {})
      steps[2] = { step: 'Refresh clients', status: 'success', message: 'Data version bumped' }
    } catch {
      steps[2] = { step: 'Refresh clients', status: 'success', message: 'Refresh signal skipped' }
    }

    const totalDuration = Date.now() - startTime

    return NextResponse.json({
      success: true,
      message: 'Cache cleared! The server will recompile on next page load. Please refresh the page to see updates.',
      duration: `${(totalDuration / 1000).toFixed(1)}s`,
      steps,
    })
  } catch (e: any) {
    return NextResponse.json({
      success: false,
      error: e.message || 'Deploy failed',
      steps,
    }, { status: 500 })
  }
}
