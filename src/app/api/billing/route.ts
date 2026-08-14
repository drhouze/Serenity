import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { logAudit, AUDIT_ACTIONS, getFacilityName } from '@/lib/audit'

// POST /api/billing?action=repeatLastMonth  — repeat all unbilled items from last month for a resident
// POST /api/billing?action=generateMonthly  — generate monthly room+care charges for all active residents
// POST /api/billing?action=generateMonthlyForResident — generate for a single resident

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'APP_DEVELOPER' && user.role !== 'OWNER' && user.role !== 'MANAGER' && user.role !== 'RECEPTION') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action') || ''
  const body = await req.json().catch(() => ({}))

  try {
    if (action === 'repeatLastMonth') {
      // Find all unbilled items for this resident from last month
      const now = new Date()
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59)
      const residentId = body.residentId
      if (!residentId) return NextResponse.json({ error: 'residentId required' }, { status: 400 })

      // Fetch resident name + code + facility for the audit log
      const residentInfo = await db.resident.findUnique({
        where: { id: residentId },
        select: { firstName: true, lastName: true, code: true, facilityId: true },
      })
      const residentLabel = residentInfo ? `${residentInfo.code ? residentInfo.code + ' ' : ''}${residentInfo.firstName} ${residentInfo.lastName}`.trim() : residentId

      const items = await db.invoiceItem.findMany({
        where: {
          residentId,
          billed: false,
          serviceDate: { gte: lastMonthStart, lte: lastMonthEnd },
        },
      })

      if (items.length === 0) {
        return NextResponse.json({ success: 0, failed: 0, message: 'No items found from last month for this resident' })
      }

      let success = 0
      for (const item of items) {
        await db.invoiceItem.create({
          data: {
            residentId: item.residentId,
            description: item.description,
            category: item.category,
            serviceDate: new Date(),
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.quantity * item.unitPrice,
            billed: false,
          },
        })
        success++
      }
      const repeatFacilityName = await getFacilityName(residentInfo?.facilityId)
      await logAudit({
        userId: user.id,
        userName: user.name,
        userCode: user.code,
        userRole: user.role,
        action: AUDIT_ACTIONS.UNBILLED_ITEM_REPEATED,
        entityType: 'RESIDENT',
        entityId: residentId,
        description: `${user.name} repeated ${success} unbilled items from last month for ${residentLabel}`,
        metadata: { residentId, residentCode: residentInfo?.code, count: success },
        facilityId: residentInfo?.facilityId || null,
        facilityName: repeatFacilityName,
      })
      return NextResponse.json({ success, failed: 0, message: `Repeated ${success} items from last month` })
    }

    if (action === 'generateMonthly') {
      // Generate monthly room + care charges for ALL active residents
      // Find products with category ROOM and CARE that are "monthly" recurring
      const facilityId = body.facilityId
      const productWhere: any = { active: true, unit: 'month' }
      if (facilityId) productWhere.facilityId = facilityId
      const roomProducts = await db.product.findMany({ where: { ...productWhere, category: 'ROOM' } })
      const careProducts = await db.product.findMany({ where: { ...productWhere, category: 'CARE' } })

      // Use the first room product and first care product as defaults
      const roomProduct = roomProducts[0]
      const careProduct = careProducts[0]

      if (!roomProduct && !careProduct) {
        return NextResponse.json({ error: 'No monthly room or care products found in catalog' }, { status: 400 })
      }

      // Scope residents to the selected facility (or user's accessible facilities)
      const residentWhere: any = { status: 'ACTIVE' }
      if (facilityId) {
        residentWhere.facilityId = facilityId
      } else if (user.level > 1) {
        // Non-owner/developer: scope to their assigned facilities
        const userFacilityIds = (user.facilityIds || '').split(',').map(s => s.trim()).filter(Boolean)
        if (userFacilityIds.length > 0) residentWhere.facilityId = { in: userFacilityIds }
      }
      // Developer (level 0) and Owner (level 1) with no facilityId = all facilities
      const residents = await db.resident.findMany({ where: residentWhere })
      const serviceDate = new Date()

      let success = 0
      const errors: string[] = []

      for (const r of residents) {
        try {
          // Determine room charge based on room type
          let roomCharge = roomProduct
          if (r.roomId) {
            const room = await db.room.findUnique({ where: { id: r.roomId } })
            if (room) {
              const matchingRoomProduct = roomProducts.find(p =>
                (room.type === 'PRIVATE' && p.name.toLowerCase().includes('private')) ||
                (room.type === 'SEMI_PRIVATE' && p.name.toLowerCase().includes('semi')) ||
                (room.type === 'WARD' && p.name.toLowerCase().includes('ward'))
              )
              if (matchingRoomProduct) roomCharge = matchingRoomProduct
            }
          }

          if (roomCharge) {
            await db.invoiceItem.create({
              data: {
                residentId: r.id,
                description: `${roomCharge.name} — ${serviceDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
                category: 'ROOM',
                serviceDate,
                quantity: 1,
                unitPrice: roomCharge.unitPrice,
                total: roomCharge.unitPrice,
                billed: false,
              },
            })
          }

          if (careProduct) {
            await db.invoiceItem.create({
              data: {
                residentId: r.id,
                description: `${careProduct.name} — ${serviceDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
                category: 'CARE',
                serviceDate,
                quantity: 1,
                unitPrice: careProduct.unitPrice,
                total: careProduct.unitPrice,
                billed: false,
              },
            })
          }
          success++
        } catch (e: any) {
          errors.push(`${r.firstName} ${r.lastName}: ${e.message}`)
        }
      }

      const genMonthlyFacilityName = facilityId ? await getFacilityName(facilityId) : (user.level <= 1 ? 'All Facilities' : null)
      await logAudit({
        userId: user.id,
        userName: user.name,
        userCode: user.code,
        userRole: user.role,
        action: AUDIT_ACTIONS.MONTHLY_CHARGES_GENERATED,
        entityType: 'INVOICE',
        description: `${user.name} generated monthly charges for ${success} residents (${errors.length} failed)`,
        metadata: { success, failed: errors.length },
        facilityId: facilityId || null,
        facilityName: genMonthlyFacilityName,
      })

      return NextResponse.json({
        success,
        failed: errors.length,
        errors,
        message: `Generated charges for ${success} residents`,
      })
    }

    if (action === 'generateMonthlyForResident') {
      // Generate monthly charges for a single resident
      const residentId = body.residentId
      if (!residentId) return NextResponse.json({ error: 'residentId required' }, { status: 400 })

      const roomProducts = await db.product.findMany({ where: { category: 'ROOM', active: true, unit: 'month' } })
      const careProducts = await db.product.findMany({ where: { category: 'CARE', active: true, unit: 'month' } })
      const roomProduct = roomProducts[0]
      const careProduct = careProducts[0]

      const r = await db.resident.findUnique({ where: { id: residentId }, include: { room: true } })
      if (!r) return NextResponse.json({ error: 'Resident not found' }, { status: 404 })

      const serviceDate = new Date()
      let count = 0

      // Room charge
      let roomCharge = roomProduct
      if (r.room) {
        const roomType = r.room.type
        const matchingRoomProduct = roomProducts.find(p =>
          (roomType === 'PRIVATE' && p.name.toLowerCase().includes('private')) ||
          (roomType === 'SEMI_PRIVATE' && p.name.toLowerCase().includes('semi')) ||
          (roomType === 'WARD' && p.name.toLowerCase().includes('ward'))
        )
        if (matchingRoomProduct) roomCharge = matchingRoomProduct
      }

      if (roomCharge) {
        await db.invoiceItem.create({
          data: {
            residentId: r.id,
            description: `${roomCharge.name} — ${serviceDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
            category: 'ROOM',
            serviceDate,
            quantity: 1,
            unitPrice: roomCharge.unitPrice,
            total: roomCharge.unitPrice,
            billed: false,
          },
        })
        count++
      }

      if (careProduct) {
        await db.invoiceItem.create({
          data: {
            residentId: r.id,
            description: `${careProduct.name} — ${serviceDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
            category: 'CARE',
            serviceDate,
            quantity: 1,
            unitPrice: careProduct.unitPrice,
            total: careProduct.unitPrice,
            billed: false,
          },
        })
        count++
      }

      const residentLabel = `${r.code ? r.code + ' ' : ''}${r.firstName} ${r.lastName}`.trim()
      const singleFacilityName = await getFacilityName(r.facilityId)
      await logAudit({
        userId: user.id,
        userName: user.name,
        userCode: user.code,
        userRole: user.role,
        action: AUDIT_ACTIONS.MONTHLY_CHARGES_GENERATED,
        entityType: 'RESIDENT',
        entityId: residentId,
        description: `${user.name} generated ${count} monthly charges for ${residentLabel}`,
        metadata: { residentId, residentCode: r.code, count },
        facilityId: r.facilityId || null,
        facilityName: singleFacilityName,
      })

      return NextResponse.json({ success: count, failed: 0, message: `Generated ${count} monthly charges` })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    console.error('Billing API error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
