import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { exec } from 'child_process'
import { promisify } from 'util'
import { readdir, stat, unlink, rmdir } from 'fs/promises'
import path from 'path'
import os from 'os'

const execAsync = promisify(exec)

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/cleanup — returns disk space info and temp file sizes
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'APP_DEVELOPER') {
    return NextResponse.json({ error: 'Only App Developer can access cleanup' }, { status: 403 })
  }

  try {
    // Get disk space. The `df -h /` output can have 5 or 6 columns depending
    // on whether the filesystem name has spaces or is very long. The columns
    // we care about (used, available, use%) are always the last 4 — so we
    // parse from the end.
    //
    // Example output (long filesystem name → 6 cols):
    //   c-6a4ad422-...-rootfs  9.9G  5.0G  4.4G  54% /
    //                       ↑ total  ↑ used ↑ avail ↑%  ↑ mount
    //
    // Example output (short filesystem name → 5 cols):
    //   /dev/sda1  9.9G  5.0G  4.4G  54% /
    //
    // Parsing from the end (parts.length - N) is robust to both formats.
    const { stdout: dfOutput } = await execAsync('df -h / 2>/dev/null | tail -1')
    const parts = dfOutput.trim().split(/\s+/)
    const n = parts.length
    const diskInfo = {
      total: n >= 5 ? parts[n - 5] : '?',     // total size
      used: n >= 4 ? parts[n - 4] : '?',      // used
      available: n >= 3 ? parts[n - 3] : '?', // available
      usePercent: n >= 2 ? parts[n - 2] : '?',// use% (e.g. "54%")
      mount: n >= 1 ? parts[n - 1] : '?',     // mount point
      filesystem: n >= 6 ? parts.slice(0, n - 5).join(' ') : '?',
    }

    // Get temp file sizes in /tmp (build artifacts, old backups)
    const tmpFiles: { name: string; size: number; path: string }[] = []
    let tmpTotalSize = 0
    try {
      const entries = await readdir('/tmp')
      for (const entry of entries) {
        const fullPath = path.join('/tmp', entry)
        try {
          const s = await stat(fullPath)
          if (s.isDirectory() && (entry.startsWith('build_') || entry.startsWith('backup-') || entry.startsWith('verify-') || entry.startsWith('db-backup'))) {
            // Get directory size
            const { stdout: duOut } = await execAsync(`du -sb "${fullPath}" 2>/dev/null | cut -f1`)
            const size = parseInt(duOut.trim()) || 0
            tmpFiles.push({ name: entry, size, path: fullPath })
            tmpTotalSize += size
          } else if (s.isFile() && (entry.endsWith('.db') || entry.endsWith('.tar.gz') || entry.endsWith('.log'))) {
            tmpFiles.push({ name: entry, size: s.size, path: fullPath })
            tmpTotalSize += s.size
          }
        } catch {}
      }
    } catch {}

    // Get .next cache size
    let nextCacheSize = 0
    try {
      const { stdout: duNext } = await execAsync('du -sb /home/z/my-project/.next 2>/dev/null | cut -f1')
      nextCacheSize = parseInt(duNext.trim()) || 0
    } catch {}

    // Get database file size (SQLite only — on PostgreSQL/Supabase this is 0)
    let dbSize = 0
    try {
      const dbUrl = process.env.DATABASE_URL || ''
      if (dbUrl.startsWith('file:')) {
        const dbPath = dbUrl.replace(/^file:/, '')
        const dbStat = await stat(dbPath)
        dbSize = dbStat.size
      }
    } catch {}

    // Get system memory
    const totalMem = os.totalmem()
    const freeMem = os.freemem()
    const memInfo = {
      total: `${(totalMem / 1024 / 1024 / 1024).toFixed(1)} GB`,
      free: `${(freeMem / 1024 / 1024 / 1024).toFixed(1)} GB`,
      used: `${((totalMem - freeMem) / 1024 / 1024 / 1024).toFixed(1)} GB`,
      usePercent: `${Math.round(((totalMem - freeMem) / totalMem) * 100)}%`,
    }

    // AUTO-CLEANUP: If disk usage > 80%, automatically delete old build_fullstack_*
    // directories in /tmp (keeping only the 3 most recent). This prevents the disk
    // from silently filling up and causing deployment failures.
    let autoCleanedCount = 0
    let autoCleanedMB = 0
    const diskPct = parseInt(diskInfo.usePercent?.replace('%', '') || '0')
    if (diskPct >= 80) {
      try {
        const allEntries = await readdir('/tmp')
        const buildDirs = allEntries
          .filter(e => e.startsWith('build_fullstack_'))
          .map(e => {
            const fullPath = path.join('/tmp', e)
            // Extract timestamp from dirname for sorting (newest last)
            const ts = parseInt(e.replace('build_fullstack_', '')) || 0
            return { name: e, path: fullPath, ts }
          })
          .sort((a, b) => b.ts - a.ts) // newest first

        // Keep the 3 most recent, delete the rest
        const toDelete = buildDirs.slice(3)
        for (const d of toDelete) {
          try {
            const { stdout: duOut } = await execAsync(`du -sb "${d.path}" 2>/dev/null | cut -f1`)
            const size = parseInt(duOut.trim()) || 0
            await execAsync(`rm -rf "${d.path}"`)
            autoCleanedCount++
            autoCleanedMB += size
          } catch {}
        }
        if (autoCleanedCount > 0) {
          console.log(`[Cleanup] Auto-cleaned ${autoCleanedCount} old build dirs (${(autoCleanedMB / 1024 / 1024).toFixed(1)} MB) because disk was at ${diskInfo.usePercent}`)
        }
      } catch {}
    }

    return NextResponse.json({
      disk: diskInfo,
      tempFiles: tmpFiles.sort((a, b) => b.size - a.size),
      tempTotalSize: tmpTotalSize,
      tempTotalSizeMB: (tmpTotalSize / 1024 / 1024).toFixed(1),
      nextCacheSize,
      nextCacheSizeMB: (nextCacheSize / 1024 / 1024).toFixed(1),
      dbSize,
      dbSizeMB: (dbSize / 1024 / 1024).toFixed(2),
      memory: memInfo,
      autoCleaned: autoCleanedCount > 0 ? { count: autoCleanedCount, freedMB: (autoCleanedMB / 1024 / 1024).toFixed(1) } : null,
    })
  } catch (e: any) {
    console.error('Cleanup info error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/cleanup — cleans up temp files and build cache (Owner only)
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'APP_DEVELOPER') {
    return NextResponse.json({ error: 'Only App Developer can cleanup' }, { status: 403 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const cleanTemp = body.temp !== false // default true
    const cleanNext = body.next !== false // default true
    const cleanLogs = body.logs === true // default false

    let deletedCount = 0
    let freedBytes = 0
    const details: string[] = []

    // Clean /tmp build artifacts and old backups
    if (cleanTemp) {
      try {
        const entries = await readdir('/tmp')
        for (const entry of entries) {
          const fullPath = path.join('/tmp', entry)
          try {
            const s = await stat(fullPath)
            const shouldDelete =
              (s.isDirectory() && (entry.startsWith('build_') || entry.startsWith('backup-') || entry.startsWith('verify-') || entry.startsWith('db-backup'))) ||
              (s.isFile() && (entry.endsWith('.db') || entry.endsWith('.tar.gz')))

            if (shouldDelete) {
              const size = s.isFile() ? s.size : parseInt((await execAsync(`du -sb "${fullPath}" 2>/dev/null | cut -f1`)).stdout.trim()) || 0
              freedBytes += size

              if (s.isDirectory()) {
                await execAsync(`rm -rf "${fullPath}"`)
              } else {
                await unlink(fullPath)
              }
              deletedCount++
              details.push(`Deleted: ${entry} (${(size / 1024 / 1024).toFixed(1)} MB)`)
            }
          } catch {}
        }
      } catch (e: any) {
        details.push(`Temp cleanup warning: ${e.message?.slice(0, 80)}`)
      }
    }

    // Clean .next build cache (safe — Next.js regenerates it on next build/dev start)
    if (cleanNext) {
      try {
        const { stdout: duOut } = await execAsync('du -sb /home/z/my-project/.next 2>/dev/null | cut -f1')
        const nextSize = parseInt(duOut.trim()) || 0
        // Only delete the cache subdirectories, NOT the dev/lock (which would kill the dev server)
        await execAsync('rm -rf /home/z/my-project/.next/cache /home/z/my-project/.next/server 2>/dev/null')
        freedBytes += nextSize
        deletedCount++
        details.push(`Cleaned .next cache (${(nextSize / 1024 / 1024).toFixed(1)} MB)`)
      } catch (e: any) {
        details.push(`Next cache cleanup warning: ${e.message?.slice(0, 80)}`)
      }
    }

    // Clean old log files
    if (cleanLogs) {
      try {
        const { stdout } = await execAsync('find /home/z/my-project -name "*.log" -type f 2>/dev/null')
        const logs = stdout.trim().split('\n').filter(Boolean)
        for (const logFile of logs) {
          try {
            const s = await stat(logFile)
            freedBytes += s.size
            await unlink(logFile)
            deletedCount++
            details.push(`Deleted log: ${path.basename(logFile)} (${(s.size / 1024).toFixed(0)} KB)`)
          } catch {}
        }
      } catch (e: any) {
        details.push(`Log cleanup warning: ${e.message?.slice(0, 80)}`)
      }
    }

    // Get updated disk space (parse from the end — see GET handler for why)
    const { stdout: dfOutput } = await execAsync('df -h / 2>/dev/null | tail -1')
    const parts = dfOutput.trim().split(/\s+/)
    const n = parts.length

    return NextResponse.json({
      success: true,
      deletedCount,
      freedBytes,
      freedMB: (freedBytes / 1024 / 1024).toFixed(1),
      details,
      diskAfter: {
        total: n >= 5 ? parts[n - 5] : '?',
        used: n >= 4 ? parts[n - 4] : '?',
        available: n >= 3 ? parts[n - 3] : '?',
        usePercent: n >= 2 ? parts[n - 2] : '?',
        mount: n >= 1 ? parts[n - 1] : '?',
      },
    })
  } catch (e: any) {
    console.error('Cleanup error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
