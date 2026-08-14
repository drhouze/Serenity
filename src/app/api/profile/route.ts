import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, verifyPassword } from '@/lib/auth'
import crypto from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// PATCH /api/profile — self-service profile update
// Any logged-in user can update their own name, email, phone, and password.
// They CANNOT change their role, level, facilityIds, linkedResidentIds, or moduleAccess.
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { name, email, phone, currentPassword, newPassword } = body

  // Get current user from DB
  const dbUser = await db.user.findUnique({ where: { id: user.id } })
  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // Build update data — ONLY allow name, email, phone, and passwordHash
  const updateData: any = {}

  if (name !== undefined) {
    if (!name || name.trim().length < 2) {
      return NextResponse.json({ error: 'Name must be at least 2 characters' }, { status: 400 })
    }
    updateData.name = name.trim()
  }

  if (email !== undefined) {
    const normalizedEmail = email.toLowerCase().trim()
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      return NextResponse.json({ error: 'Valid email address required' }, { status: 400 })
    }
    // Check if email is already taken by another user
    const existing = await db.user.findUnique({ where: { email: normalizedEmail } })
    if (existing && existing.id !== user.id) {
      return NextResponse.json({ error: 'This email is already in use by another account' }, { status: 400 })
    }
    updateData.email = normalizedEmail
  }

  if (phone !== undefined) {
    updateData.phone = phone || null
  }

  // Password change — requires current password verification
  if (newPassword) {
    if (!currentPassword) {
      return NextResponse.json({ error: 'Current password is required to change password' }, { status: 400 })
    }
    if (newPassword.length < 6) {
      return NextResponse.json({ error: 'New password must be at least 6 characters' }, { status: 400 })
    }

    // Verify current password
    const valid = verifyPassword(currentPassword, dbUser.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 })
    }

    // Hash new password
    const salt = crypto.randomBytes(16).toString('hex')
    const hash = crypto.scryptSync(newPassword, salt, 64).toString('hex')
    updateData.passwordHash = `${salt}:${hash}`
  }

  // Prevent any attempt to change restricted fields
  delete updateData.role
  delete updateData.level
  delete updateData.facilityIds
  delete updateData.linkedResidentIds
  delete updateData.moduleAccess
  delete updateData.code
  delete updateData.active

  // If nothing to update
  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const updated = await db.user.update({
    where: { id: user.id },
    data: updateData,
    select: { id: true, name: true, email: true, phone: true, role: true, level: true },
  })

  return NextResponse.json({ success: true, user: updated })
}
