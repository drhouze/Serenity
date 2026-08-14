import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/upload-logo — uploads a logo image file and returns the URL path.
// APP_DEVELOPER, OWNER, MANAGER only.
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'APP_DEVELOPER' && user.role !== 'OWNER' && user.role !== 'MANAGER') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('logo') as File
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml', 'image/webp', 'image/gif']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: `Invalid file type: ${file.type}. Allowed: PNG, JPEG, SVG, WebP, GIF` }, { status: 400 })
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 2MB)' }, { status: 400 })
    }

    // Generate filename: logo-<timestamp>.<ext>
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
    const fileName = `logo-${Date.now()}.${ext}`
    const uploadDir = path.join(process.cwd(), 'public', 'uploads')
    await mkdir(uploadDir, { recursive: true })
    const filePath = path.join(uploadDir, fileName)

    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(filePath, buffer)

    const url = `/uploads/${fileName}`
    console.log(`[UploadLogo] Saved logo to ${filePath} (${file.size} bytes)`)

    return NextResponse.json({ success: true, url, fileName, size: file.size })
  } catch (e: any) {
    console.error('[UploadLogo] Error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
