import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { exec } from 'child_process'
import { promisify } from 'util'
import { createReadStream } from 'fs'
import { stat, unlink } from 'fs/promises'
import path from 'path'

const execAsync = promisify(exec)

// Force Node.js runtime (not Edge) and prevent caching
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes

// GET /api/download-project — downloads the entire project as a .tar.gz file (Owner only)
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'APP_DEVELOPER') {
    return NextResponse.json({ error: 'Only Owner can download the project' }, { status: 403 })
  }

  let filePath: string | null = null

  try {
    const projectRoot = process.cwd()
    const fileName = `nursing-home-app-${new Date().toISOString().slice(0, 10)}.tar.gz`
    // Use /tmp instead of public/ to avoid Next.js trying to serve it as a static file
    filePath = path.join('/tmp', fileName)

    // Remove existing file if any
    try { await unlink(filePath) } catch {}

    // Create a tar.gz archive, excluding heavy/regenerable directories
    await execAsync(
      `cd "${projectRoot}" && tar czf "${filePath}" ` +
      `--exclude="node_modules" ` +
      `--exclude=".next" ` +
      `--exclude=".git" ` +
      `--exclude=".turbo" ` +
      `--exclude="*.log" ` +
      `--exclude="tmp" ` +
      `--exclude="public/nursing-home-app-*.tar.gz" ` +
      `.`,
      { maxBuffer: 200 * 1024 * 1024 }
    )

    // Verify the file was created
    const fileStat = await stat(filePath)
    if (fileStat.size === 0) {
      throw new Error('Archive file is empty — tar command may have failed')
    }

    // Stream the file directly as the response body
    const nodeStream = createReadStream(filePath)

    const webStream = new ReadableStream({
      start(controller) {
        nodeStream.on('data', (chunk) => {
          controller.enqueue(new Uint8Array(chunk))
        })
        nodeStream.on('end', () => {
          controller.close()
          // Clean up temp file after stream completes
          if (filePath) { try { unlink(filePath) } catch {} }
        })
        nodeStream.on('error', (err) => {
          console.error('Stream error:', err)
          try { controller.error(err) } catch {}
          if (filePath) { try { unlink(filePath) } catch {} }
        })
      },
      cancel() {
        nodeStream.destroy()
        if (filePath) { try { unlink(filePath) } catch {} }
      },
    })

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': fileStat.size.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Connection': 'keep-alive',
      },
    })
  } catch (e: any) {
    console.error('Download project error:', e)
    if (filePath) { try { await unlink(filePath) } catch {} }
    return NextResponse.json({ error: e.message || 'Failed to create project archive' }, { status: 500 })
  }
}
