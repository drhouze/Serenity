import { db } from '@/lib/db'

// ============== TIER LIMITS ==============
// Reads the org's tier from the EXISTING `businessType:<orgId>` Setting
// (repurposed from business types to subscription tiers):
//
//   Tier (businessType)   Beds    Facilities   Users     Modules
//   ──────────────────────────────────────────────────────────────
//   free                  ≤ 8     1            3         Core care only
//   pro                   ∞       1            ∞         All except AI
//   enterprise            ∞       ∞            ∞         Everything
//
// The tier is stored as: businessType:<orgId> = 'free' | 'pro' | 'enterprise'
// If no setting exists, defaults to 'free' (safest — restricts everything).
//
// For backwards compat, 'nursing_home' (the old default) is treated as 'pro'.

export type Tier = 'free' | 'pro' | 'enterprise'

interface TierLimits {
  tier: Tier
  maxBeds: number | null      // null = unlimited
  maxFacilities: number | null
  maxUsers: number | null
}

const TIER_CONFIG: Record<Tier, TierLimits> = {
  free: { tier: 'free', maxBeds: 8, maxFacilities: 1, maxUsers: 3 },
  pro: { tier: 'pro', maxBeds: null, maxFacilities: 1, maxUsers: null },
  enterprise: { tier: 'enterprise', maxBeds: null, maxFacilities: null, maxUsers: null },
}

// Map old business types to tiers (backwards compat)
const TYPE_TO_TIER: Record<string, Tier> = {
  free: 'free',
  pro: 'pro',
  enterprise: 'enterprise',
  nursing_home: 'pro',  // existing orgs default to Pro
  generic: 'pro',
  clinic: 'pro',
  tailor: 'pro',
}

export async function getOrgTier(orgId: string | null): Promise<Tier> {
  if (!orgId) return 'free'
  try {
    const setting = await db.setting.findUnique({ where: { key: `businessType:${orgId}` } })
    if (setting) {
      const raw = JSON.parse(setting.value) as string
      const tier = TYPE_TO_TIER[raw]
      if (tier) return tier
      // Direct match for 'free'/'pro'/'enterprise'
      if (raw === 'free' || raw === 'pro' || raw === 'enterprise') return raw as Tier
    }
  } catch {}
  // Default: existing orgs without a tier setting get 'pro' (full access).
  // New orgs should be set to 'free' explicitly by the Developer.
  return 'pro'
}

export async function getTierLimits(orgId: string | null): Promise<TierLimits> {
  const tier = await getOrgTier(orgId)
  return TIER_CONFIG[tier]
}

export async function setOrgTier(orgId: string, tier: Tier): Promise<void> {
  // Uses the EXISTING businessType:<orgId> setting key (repurposed for tiers)
  await db.setting.upsert({
    where: { key: `businessType:${orgId}` },
    update: { value: JSON.stringify(tier) },
    create: { key: `businessType:${orgId}`, value: JSON.stringify(tier) },
  })
}

// ============== RESOURCE COUNTERS ==============
// Counts current beds / facilities / users for an org

export async function countOrgBeds(orgId: string): Promise<number> {
  // Beds are linked to rooms → rooms linked to facilities → facilities linked to org
  const count = await db.bed.count({
    where: { room: { facility: { organizationId: orgId } } },
  })
  return count
}

export async function countOrgFacilities(orgId: string): Promise<number> {
  return await db.facility.count({ where: { organizationId: orgId } })
}

export async function countOrgUsers(orgId: string): Promise<number> {
  // Count active, non-developer users in this org
  return await db.user.count({
    where: { organizationId: orgId, active: true, level: { gt: 0 } },
  })
}

// ============== VALIDATION HELPERS ==============
// Returns { allowed: boolean, limit: number|null, current: number, tier: Tier, message?: string }

export interface TierCheckResult {
  allowed: boolean
  limit: number | null
  current: number
  tier: Tier
  message?: string
}

export async function checkBedLimit(orgId: string | null, additionalBeds: number = 0): Promise<TierCheckResult> {
  const limits = await getTierLimits(orgId)
  if (limits.maxBeds === null) return { allowed: true, limit: null, current: 0, tier: limits.tier }
  const current = orgId ? await countOrgBeds(orgId) : 0
  const newTotal = current + additionalBeds
  if (newTotal > limits.maxBeds) {
    return {
      allowed: false,
      limit: limits.maxBeds,
      current,
      tier: limits.tier,
      message: `This organization is on the ${limits.tier} tier (max ${limits.maxBeds} beds). Current: ${current} beds. Adding ${additionalBeds} more would exceed the limit. Upgrade to Pro for unlimited beds.`,
    }
  }
  return { allowed: true, limit: limits.maxBeds, current, tier: limits.tier }
}

export async function checkFacilityLimit(orgId: string | null): Promise<TierCheckResult> {
  const limits = await getTierLimits(orgId)
  if (limits.maxFacilities === null) return { allowed: true, limit: null, current: 0, tier: limits.tier }
  const current = orgId ? await countOrgFacilities(orgId) : 0
  if (current >= limits.maxFacilities) {
    return {
      allowed: false,
      limit: limits.maxFacilities,
      current,
      tier: limits.tier,
      message: `This organization is on the ${limits.tier} tier (max ${limits.maxFacilities} facility). Current: ${current} facilities. Upgrade to Enterprise for unlimited facilities.`,
    }
  }
  return { allowed: true, limit: limits.maxFacilities, current, tier: limits.tier }
}

export async function checkUserLimit(orgId: string | null): Promise<TierCheckResult> {
  const limits = await getTierLimits(orgId)
  if (limits.maxUsers === null) return { allowed: true, limit: null, current: 0, tier: limits.tier }
  const current = orgId ? await countOrgUsers(orgId) : 0
  if (current >= limits.maxUsers) {
    return {
      allowed: false,
      limit: limits.maxUsers,
      current,
      tier: limits.tier,
      message: `This organization is on the ${limits.tier} tier (max ${limits.maxUsers} user accounts). Current: ${current} users. Upgrade to Pro for unlimited user accounts.`,
    }
  }
  return { allowed: true, limit: limits.maxUsers, current, tier: limits.tier }
}
