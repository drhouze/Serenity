import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { callAI, getAIConfig, isFeatureEnabled, AI_FEATURES } from '@/lib/ai'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST /api/ai/chat — makes an AI request using the org's configured API
// Body: { feature: string, prompt: string, residentId?: string, systemPrompt?: string }
//
// Token-saving flow:
//   1. Check the org's Q&A knowledge base first — if a match is found,
//      return the preset answer immediately (0 tokens used).
//   2. If no match, check if 'allowDataQueries' is enabled — if so, include
//      facility-scoped data in the prompt context.
//   3. Call the LLM with the full context.
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Block FAMILY users from using AI
  if (user.role === 'FAMILY') {
    return NextResponse.json({ error: 'AI Assistant is not available for family accounts.' }, { status: 403 })
  }

  const body = await req.json()
  const { feature, prompt, residentId, systemPrompt } = body

  if (!feature || !prompt) {
    return NextResponse.json({ error: 'feature and prompt are required' }, { status: 400 })
  }

  const orgId = user.organizationId
  if (!orgId) {
    return NextResponse.json({ error: 'Your account is not linked to an organization.' }, { status: 400 })
  }

  // ===== Step 0: Detect navigation intent =====
  // This runs BEFORE the AI-enabled check — navigation help should work
  // even if AI is not configured (it's just preset Q&A, no LLM needed).
  // For resident-specific queries (e.g. "show invoices for C-0001"), we also
  // verify the resident belongs to the user's accessible facilities (data separation).
  const navActions = await detectNavigationIntent(prompt, user)
  if (navActions) {
    return NextResponse.json({
      content: navActions.message,
      fromKnowledgeBase: true,  // it's a preset answer — 0 tokens
      tokensUsed: { prompt: 0, completion: 0, total: 0 },
      actions: navActions.actions,
    })
  }

  // Check if AI is enabled
  const config = await getAIConfig(orgId)
  if (!config) {
    return NextResponse.json({
      error: 'AI features are not enabled for your organization. Contact the App Developer.',
      features: AI_FEATURES.map(f => ({ id: f.id, label: f.label, description: f.description })),
    }, { status: 403 })
  }

  if (!isFeatureEnabled(config, feature)) {
    return NextResponse.json({
      error: `The "${feature}" feature is not enabled for your organization.`,
      enabledFeatures: config.enabledFeatures.split(',').map(f => f.trim()),
    }, { status: 403 })
  }

  // ===== Step 1: Check the Q&A knowledge base =====
  // The knowledge base is stored as a Setting with key 'aiKnowledgeBase:<orgId>'.
  // It's an array of { question, answer, keywords } pairs.
  // If the user's prompt matches a keyword or closely matches a question,
  // return the preset answer immediately — 0 tokens used.
  try {
    const kbSetting = await db.setting.findUnique({
      where: { key: `aiKnowledgeBase:${orgId}` },
    })
    if (kbSetting) {
      const kb: Array<{ question: string; answer: string; keywords?: string[] }> = JSON.parse(kbSetting.value)
      const promptLower = prompt.toLowerCase().trim()

      for (const entry of kb) {
        // Check keywords first (fast match)
        if (entry.keywords && entry.keywords.length > 0) {
          for (const kw of entry.keywords) {
            if (promptLower.includes(kw.toLowerCase())) {
              return NextResponse.json({
                content: entry.answer,
                fromKnowledgeBase: true,
                tokensUsed: { prompt: 0, completion: 0, total: 0 },
              })
            }
          }
        }
        // Check if the prompt closely matches the question (contains all significant words)
        const questionWords = entry.question.toLowerCase().split(/\s+/).filter(w => w.length > 3)
        if (questionWords.length > 0) {
          const matchCount = questionWords.filter(w => promptLower.includes(w)).length
          // If 70%+ of the question's significant words appear in the prompt, it's a match
          if (matchCount / questionWords.length >= 0.7) {
            return NextResponse.json({
              content: entry.answer,
              fromKnowledgeBase: true,
              tokensUsed: { prompt: 0, completion: 0, total: 0 },
            })
          }
        }
      }
    }
  } catch (e: any) {
    // KB check failed — continue to LLM call (non-blocking)
    console.log('[AI] Knowledge base check failed:', e.message?.slice(0, 100))
  }

  // ===== Step 2: Build context based on allowDataQueries setting =====
  // If the org has 'allowDataQueries' enabled, include facility-scoped data
  // in the system prompt so the AI can answer questions about residents,
  // meds, vitals, etc. The data is scoped to the user's accessible facilities.
  let fullSystemPrompt = systemPrompt
  let dataContext = ''

  try {
    const dataQuerySetting = await db.setting.findUnique({
      where: { key: `aiAllowDataQueries:${orgId}` },
    })
    const allowDataQueries = dataQuerySetting ? JSON.parse(dataQuerySetting.value) : false

    if (allowDataQueries) {
      // Fetch facility-scoped summary data for context
      // Only include data the user has access to (facility-scoped)
      const accessibleFacilityIds = user.facilityIds
        ? user.facilityIds.split(',').map(s => s.trim()).filter(Boolean)
        : []

      // Developer sees all facilities
      const facilityFilter = user.role === 'APP_DEVELOPER'
        ? {}
        : { facilityId: { in: accessibleFacilityIds } }

      // Build a compact data summary (not full records — just enough for context)
      const [residentCount, activeMeds, todayIncidents, pendingVisits] = await Promise.all([
        db.resident.count({ where: { ...facilityFilter, status: 'ACTIVE' } }),
        db.medication.count({ where: { active: true, resident: facilityFilter } }),
        db.incidentReport.count({
          where: {
            resident: facilityFilter,
            occurredAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
          },
        }),
        db.visit.count({
          where: {
            resident: facilityFilter,
            status: 'SCHEDULED',
            scheduledAt: { gte: new Date() },
          },
        }),
      ])

      dataContext = `\n\n=== FACILITY DATA SUMMARY (scoped to your accessible facilities) ===
Active residents: ${residentCount}
Active medications: ${activeMeds}
Incidents today: ${todayIncidents}
Upcoming visits: ${pendingVisits}
=== END DATA SUMMARY ===`

      // If a specific resident is selected, include their summary
      if (residentId) {
        const resident = await db.resident.findUnique({
          where: { id: residentId },
          select: {
            firstName: true, lastName: true, code: true, gender: true,
            dateOfBirth: true, conditions: true, allergies: true, dietaryNeeds: true,
            status: true,
            medications: { where: { active: true }, select: { name: true, dosage: true, frequency: true, route: true } },
            vitals: { orderBy: { recordedAt: 'desc' }, take: 5, select: { bloodPressureSystolic: true, bloodPressureDiastolic: true, heartRate: true, temperature: true, oxygenSaturation: true, recordedAt: true } },
          },
        })
        if (resident) {
          dataContext += `\n\n=== RESIDENT: ${resident.firstName} ${resident.lastName} (${resident.code}) ===
Status: ${resident.status}
Conditions: ${resident.conditions || 'None'}
Allergies: ${resident.allergies || 'None'}
Active medications: ${resident.medications.map(m => `${m.name} ${m.dosage} ${m.frequency}`).join(', ') || 'None'}
Recent vitals: ${resident.vitals.map(v => `BP ${v.bloodPressureSystolic || '?'}/${v.bloodPressureDiastolic || '?'}, HR ${v.heartRate || '?'}`).join('; ') || 'None'}
=== END RESIDENT ===`
        }
      }

      fullSystemPrompt = (fullSystemPrompt || 'You are a helpful healthcare assistant for a nursing home.') + dataContext
    }
  } catch (e: any) {
    console.log('[AI] Data context fetch failed:', e.message?.slice(0, 100))
  }

  // ===== Step 3: Call the LLM =====
  const result = await callAI({
    organizationId: orgId,
    feature,
    prompt,
    systemPrompt: fullSystemPrompt,
    userId: user.id,
    userName: user.name,
    residentId,
  })

  if (!result.success) {
    return NextResponse.json({ error: result.error, capped: result.capped }, { status: result.capped ? 429 : 500 })
  }

  return NextResponse.json({
    content: result.content,
    tokensUsed: result.tokensUsed,
    fromKnowledgeBase: false,
  })
}

// ============================================================================
// Navigation intent detection — returns action buttons for "how to" questions
// ============================================================================

interface NavAction {
  label: string
  module: string
  tab?: string
  dialog?: string
  filter?: string
}

interface NavResult {
  message: string
  actions: NavAction[]
}

async function detectNavigationIntent(prompt: string, user: any): Promise<NavResult | null> {
  const p = prompt.toLowerCase().trim()

  // Helper: check if ANY of the keywords appear in the prompt
  const has = (...keywords: string[]) => keywords.some(k => p.includes(k))

  // ===== Resident-specific queries with data separation =====
  // Detect patterns like:
  //   "show invoices for C-0001"
  //   "unpaid invoices for resident A001"
  //   "medications for John Smith"
  //   "visits for C-0002"
  //
  // We extract the resident code/name, look it up in the DB (scoped to the
  // user's accessible facilities), and return a navigation action that
  // includes the residentId as a filter. If the resident doesn't exist or
  // belongs to a different facility, we return an error message.
  const residentQuery = await detectResidentQuery(prompt, user)
  if (residentQuery) return residentQuery

  // --- Invoice / Billing ---
  if (has('unpaid invoice', 'overdue invoice', 'outstanding')) {
    return {
      message: 'Here are your unpaid invoices. Click below to see them filtered by status:',
      actions: [{ label: 'View Unpaid Invoices', module: 'finance', tab: 'invoices', filter: 'status=UNPAID' }],
    }
  }
  if (has('invoice', 'create invoice', 'new invoice', 'bill', 'create bill')) {
    return {
      message: 'To create an invoice:\n1. Go to Finance module\n2. Click the "Invoices" tab\n3. Click "Create Invoice"\n\nOr click below to go there now:',
      actions: [{ label: 'Go to Invoices', module: 'finance', tab: 'invoices', dialog: 'createInvoice' }],
    }
  }

  // --- Payments ---
  if (has('payment', 'record payment', 'receive payment', 'add payment')) {
    return {
      message: 'To record a payment:\n1. Go to Finance module\n2. Click the "Payments" tab\n3. Click "Record Payment"\n\nOr click below:',
      actions: [{ label: 'Go to Payments', module: 'finance', tab: 'payments', dialog: 'addPayment' }],
    }
  }

  // --- Residents ---
  if (has('add resident', 'new resident', 'register resident', 'admit resident')) {
    return {
      message: 'To add a new resident:\n1. Go to Residents module\n2. Click "Add Resident"\n3. Fill in the details + select a bed\n\nOr click below:',
      actions: [{ label: 'Add Resident', module: 'residents', dialog: 'addResident' }],
    }
  }
  if (has('assign room', 'assign bed', 'room assignment', 'bed assignment')) {
    return {
      message: 'To assign a resident to a bed:\n1. Go to Residents module\n2. Click on the resident\n3. Click "Edit"\n4. Select a bed from the "Bed (Room)" dropdown\n\nOr click below to go to Residents:',
      actions: [{ label: 'Go to Residents', module: 'residents' }],
    }
  }

  // --- Rooms & Beds ---
  if (has('add room', 'new room', 'create room', 'room management')) {
    return {
      message: 'To add a room:\n1. Go to Rooms & Beds module\n2. Click "Add Room"\n3. Enter room number, capacity, type\n\nBeds are auto-created based on capacity.\n\nOr click below:',
      actions: [{ label: 'Go to Rooms & Beds', module: 'rooms' }],
    }
  }

  // --- Medications / MAR ---
  if (has('medication', 'add medication', 'prescribe', 'new medication')) {
    return {
      message: 'To add a medication:\n1. Go to Clinical module\n2. Select the resident\n3. Click "Add Medication"\n\nOr click below:',
      actions: [{ label: 'Go to Clinical', module: 'clinical' }],
    }
  }
  if (has('mar', 'medication administration', 'generate mar', 'generate med')) {
    return {
      message: 'To generate MAR entries:\n1. Go to Clinical module\n2. Click the MAR tab\n3. Click "Generate Tomorrow\'s Meds"\n\nOr click below:',
      actions: [{ label: 'Go to MAR', module: 'clinical', tab: 'mar' }],
    }
  }

  // --- Visits ---
  if (has('visit', 'schedule visit', 'new visit', 'doctor visit', 'appointment')) {
    return {
      message: 'To schedule a visit:\n1. Go to Clinical module\n2. Select the resident\n3. Click "Schedule Visit"\n\nOr click below:',
      actions: [{ label: 'Go to Clinical', module: 'clinical' }],
    }
  }

  // --- Vitals ---
  if (has('vital', 'blood pressure', 'record vital', 'add vital')) {
    return {
      message: 'To record vitals:\n1. Go to Clinical module\n2. Select the resident\n3. Click "Record Vitals"\n\nOr click below:',
      actions: [{ label: 'Go to Clinical', module: 'clinical' }],
    }
  }

  // --- Incidents ---
  if (has('incident', 'report incident', 'fall', 'accident')) {
    return {
      message: 'To report an incident:\n1. Go to Clinical module → Incidents\n2. Click "Report Incident"\n3. Fill in type, severity, description\n\nOr click below:',
      actions: [{ label: 'Go to Incidents', module: 'incidents' }],
    }
  }

  // --- Staff ---
  if (has('staff', 'add staff', 'new staff', 'register staff')) {
    return {
      message: 'To add a staff member:\n1. Go to Staff & Shifts module\n2. Click "Add Staff"\n3. Fill in name, role, contact\n\nOr click below:',
      actions: [{ label: 'Go to Staff', module: 'staff' }],
    }
  }
  if (has('shift', 'schedule shift', 'assign shift', 'roster')) {
    return {
      message: 'To schedule shifts:\n1. Go to Staff & Shifts module\n2. Click the "Schedule" tab\n3. Click on a date to add a shift\n\nOr click below:',
      actions: [{ label: 'Go to Schedule', module: 'staff', tab: 'schedule' }],
    }
  }

  // --- Leave ---
  if (has('leave', 'apply leave', 'request leave', 'annual leave', 'sick leave')) {
    return {
      message: 'To request leave:\n1. Go to Staff & Shifts module\n2. Click the "Leave" tab\n3. Click "Request Leave"\n\nOr click below:',
      actions: [{ label: 'Go to Leave', module: 'staff', tab: 'leave' }],
    }
  }

  // --- Expenses ---
  if (has('expense', 'record expense', 'add expense')) {
    return {
      message: 'To record an expense:\n1. Go to Finance module\n2. Click the "Expenses" tab\n3. Click "Add Expense"\n\nOr click below:',
      actions: [{ label: 'Go to Expenses', module: 'finance', tab: 'expenses', dialog: 'addExpense' }],
    }
  }

  // --- Inventory ---
  if (has('inventory', 'stock', 'add item', 'reorder')) {
    return {
      message: 'To manage inventory:\n1. Go to Inventory module\n2. Click "Add Item" to add a new stock item\n3. Use "Adjust Stock" to record stock in/out\n\nOr click below:',
      actions: [{ label: 'Go to Inventory', module: 'inventory' }],
    }
  }

  // --- Accounting ---
  if (has('accounting', 'journal', 'trial balance', 'balance sheet', 'income statement', 'profit loss')) {
    return {
      message: 'Accounting reports are available in the Accounting module:\n• Trial Balance\n• Income Statement\n• Balance Sheet\n• AR Aging\n\nOr click below:',
      actions: [{ label: 'Go to Accounting', module: 'accounting' }],
    }
  }

  // --- Settings ---
  if (has('settings', 'configuration', 'configure', 'ai setup', 'smtp', 'email setup')) {
    return {
      message: 'Settings are organized into tabs:\n• Facility & Org\n• Users & Levels\n• Staff Salary Presets\n• Customization\n• Backup & Restore\n• AI Assistant\n• External Integration\n\nOr click below:',
      actions: [{ label: 'Go to Settings', module: 'settings' }],
    }
  }

  // --- Backup ---
  if (has('backup', 'restore', 'export data', 'download backup')) {
    return {
      message: 'To backup or restore:\n1. Go to Developer module (if you\'re a developer)\n2. Click "Backup & Restore"\n3. Choose JSON, CSV, or SQLite format\n\nOr click below:',
      actions: [{ label: 'Go to Backup', module: 'developer' }],
    }
  }

  // --- User Profile ---
  if (has('my profile', 'change password', 'my leave', 'my salary', 'my shift')) {
    return {
      message: 'Your profile shows:\n• Login details + change password\n• Leave balance + request leave\n• Salary (pending + paid)\n• Upcoming shifts\n\nOr click below:',
      actions: [{ label: 'Go to My Profile', module: 'profile' }],
    }
  }

  return null  // no navigation intent detected
}

// ============================================================================
// Resident-specific query detection with DATA SEPARATION
// ============================================================================
// Detects patterns like "show invoices for C-0001" or "medications for John"
// Looks up the resident in the DB, SCOPED to the user's accessible facilities.
// If the resident doesn't exist or belongs to another facility → error message
// (data separation enforced).
async function detectResidentQuery(prompt: string, user: any): Promise<NavResult | null> {
  const p = prompt.toLowerCase().trim()

  // Determine which data types the user is asking about
  type DataType = 'invoices' | 'unpaid_invoices' | 'payments' | 'medications' | 'visits' | 'vitals' | 'incidents' | 'carelogs'
  let dataType: DataType | null = null

  if (p.includes('unpaid invoice') || p.includes('outstanding invoice') || p.includes('overdue invoice')) dataType = 'unpaid_invoices'
  else if (p.includes('invoice')) dataType = 'invoices'
  else if (p.includes('payment')) dataType = 'payments'
  else if (p.includes('medication') || p.includes('med')) dataType = 'medications'
  else if (p.includes('visit') || p.includes('appointment')) dataType = 'visits'
  else if (p.includes('vital')) dataType = 'vitals'
  else if (p.includes('incident') || p.includes('fall') || p.includes('accident')) dataType = 'incidents'
  else if (p.includes('care log') || p.includes('care record')) dataType = 'carelogs'

  if (!dataType) return null  // not a data-specific query

  // Extract resident code or name from the prompt
  // Pattern 1: "for C-0001" / "for RES-0001" / "resident C-0001" / "code C-0001"
  const codeMatch = p.match(/(?:for|resident|code|of)\s+([a-z]-?\d{3,5})/)
  // Pattern 2: "for John Smith" / "resident John" / "for John"
  const nameMatch = p.match(/(?:for|resident|of)\s+([a-z]+(?:\s+[a-z]+)?)/)

  let resident: any = null

  // Build the facility scope filter — this is the DATA SEPARATION enforcement
  // Users can only query residents in their accessible facilities
  const accessibleFacilityIds = user.facilityIds
    ? user.facilityIds.split(',').map((s: string) => s.trim()).filter(Boolean)
    : []

  // Developer sees all facilities
  const facilityFilter = user.role === 'APP_DEVELOPER'
    ? {}
    : { facilityId: { in: accessibleFacilityIds } }

  if (codeMatch) {
    // Try to find by code (case-insensitive — codes like C-0001, RES-0001)
    const code = codeMatch[1].toUpperCase()
    resident = await db.resident.findFirst({
      where: {
        ...facilityFilter,
        OR: [
          { code: { equals: code } },
          { code: { contains: code } },
        ],
        status: { in: ['ACTIVE', 'HOSPITALIZED', 'OUT_WITH_FAMILY'] },
      },
      select: { id: true, code: true, firstName: true, lastName: true, facilityId: true },
    })
  } else if (nameMatch) {
    // Try to find by name
    const nameParts = nameMatch[1].trim().split(/\s+/)
    const firstName = nameParts[0]
    const lastName = nameParts.slice(1).join(' ') || undefined
    resident = await db.resident.findFirst({
      where: {
        ...facilityFilter,
        status: { in: ['ACTIVE', 'HOSPITALIZED', 'OUT_WITH_FAMILY'] },
        ...(lastName
          ? { firstName: { contains: firstName }, lastName: { contains: lastName } }
          : { OR: [
              { firstName: { contains: firstName } },
              { lastName: { contains: firstName } },
            ] }
        ),
      },
      select: { id: true, code: true, firstName: true, lastName: true, facilityId: true },
    })
  }

  if (!resident) {
    // Resident not found — could be wrong code/name OR data separation (resident exists but in another facility)
    // Check if the resident exists at all (without facility filter) to give a better error
    let existsOutside = false
    if (codeMatch) {
      const code = codeMatch[1].toUpperCase()
      const anyResident = await db.resident.findFirst({
        where: { OR: [{ code: { equals: code } }, { code: { contains: code } }] },
        select: { id: true, facilityId: true },
      })
      existsOutside = !!anyResident
    }

    return {
      message: existsOutside
        ? `I couldn't find a resident matching "${codeMatch?.[1] || nameMatch?.[1]}" in your accessible facilities. They may exist in another facility — you don't have access to view their data.`
        : `I couldn't find a resident matching "${codeMatch?.[1] || nameMatch?.[1]}". Please check the resident code or name and try again.`,
      actions: [{ label: 'Go to Residents', module: 'residents' }],
    }
  }

  // Resident found — build the navigation action with the residentId filter
  const residentLabel = `${resident.code || ''} ${resident.firstName} ${resident.lastName}`.trim()
  const filter = `residentId=${resident.id}`

  const moduleMap: Record<DataType, { module: string; tab: string; label: string }> = {
    invoices: { module: 'finance', tab: 'invoices', label: `View Invoices for ${residentLabel}` },
    unpaid_invoices: { module: 'finance', tab: 'invoices', label: `View Unpaid Invoices for ${residentLabel}` },
    payments: { module: 'finance', tab: 'payments', label: `View Payments for ${residentLabel}` },
    medications: { module: 'clinical', tab: 'medications', label: `View Medications for ${residentLabel}` },
    visits: { module: 'clinical', tab: 'visits', label: `View Visits for ${residentLabel}` },
    vitals: { module: 'clinical', tab: 'vitals', label: `View Vitals for ${residentLabel}` },
    incidents: { module: 'incidents', tab: '', label: `View Incidents for ${residentLabel}` },
    carelogs: { module: 'clinical', tab: 'care', label: `View Care Logs for ${residentLabel}` },
  }

  const target = moduleMap[dataType]
  const fullFilter = dataType === 'unpaid_invoices' ? `${filter}&status=UNPAID` : filter

  return {
    message: `Found resident: ${residentLabel}\n\nClick below to view their ${dataType.replace('_', ' ')}:`,
    actions: [{ label: target.label, module: target.module, tab: target.tab, filter: fullFilter }],
  }
}
