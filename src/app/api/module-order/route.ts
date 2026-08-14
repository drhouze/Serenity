import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/module-order — returns the current user's custom module order
// Returns { order: ['dashboard', 'residents', ...] } or { order: null } if not set
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const key = `user:${user.id}:moduleOrder`
  const setting = await db.setting.findUnique({ where: { key } })
  if (setting) {
    try {
      const order = JSON.parse(setting.value)
      return NextResponse.json({ order })
    } catch {
      return NextResponse.json({ order: null })
    }
  }
  return NextResponse.json({ order: null })
}

// POST /api/module-order — saves the current user's custom module order
// Body: { order: ['dashboard', 'residents', ...] }
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const order = body.order
  if (!Array.isArray(order)) {
    return NextResponse.json({ error: 'order must be an array of module IDs' }, { status: 400 })
  }

  const key = `user:${user.id}:moduleOrder`
  await db.setting.upsert({
    where: { key },
    create: { key, value: JSON.stringify(order) },
    update: { value: JSON.stringify(order) },
  })

  return NextResponse.json({ success: true, order })
}

// DELETE /api/module-order — resets to default order
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const key = `user:${user.id}:moduleOrder`
  await db.setting.deleteMany({ where: { key } })

  return NextResponse.json({ success: true })
}
