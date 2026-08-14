'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// Reusable code badge — monospace, subtle background
export function CodeBadge({ code, className }: { code?: string | null; className?: string }) {
  if (!code) return null
  return (
    <Badge variant="outline" className={cn('text-xs font-mono bg-primary/5 text-primary border-primary/20', className)}>
      {code}
    </Badge>
  )
}

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const map: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label?: string; className?: string }> = {
    ACTIVE: { variant: 'default', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    DISCHARGED: { variant: 'secondary' },
    HOSPITALIZED: { variant: 'default', className: 'bg-red-100 text-red-700 border-red-200' },
    OUT_WITH_FAMILY: { variant: 'default', className: 'bg-violet-100 text-violet-700 border-violet-200' },
    DECEASED: { variant: 'secondary', className: 'bg-slate-200 text-slate-700 border-slate-300' },
    AVAILABLE: { variant: 'outline', className: 'bg-sky-50 text-sky-700 border-sky-200' },
    OCCUPIED: { variant: 'default', className: 'bg-amber-100 text-amber-700 border-amber-200' },
    MAINTENANCE: { variant: 'destructive' },
    PENDING: { variant: 'outline', className: 'bg-amber-50 text-amber-700 border-amber-200' },
    GIVEN: { variant: 'default', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    REFUSED: { variant: 'destructive' },
    MISSED: { variant: 'destructive' },
    FINISHED: { variant: 'secondary', className: 'bg-orange-100 text-orange-700 border-orange-200' },
    WITHHELD: { variant: 'default', className: 'bg-amber-100 text-amber-700 border-amber-200' },
    DELAYED: { variant: 'outline', className: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
    RESIDENT_OUT: { variant: 'default', className: 'bg-violet-100 text-violet-700 border-violet-200' },
    SCHEDULED: { variant: 'outline', className: 'bg-sky-50 text-sky-700 border-sky-200' },
    COMPLETED: { variant: 'default', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    CANCELLED: { variant: 'secondary' },
    NO_SHOW: { variant: 'destructive' },
    UNPAID: { variant: 'outline', className: 'bg-amber-50 text-amber-700 border-amber-200' },
    PARTIAL: { variant: 'default', className: 'bg-orange-100 text-orange-700 border-orange-200' },
    PAID: { variant: 'default', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    OVERDUE: { variant: 'destructive' },
  }
  const cfg = map[status] || { variant: 'secondary' as const }
  return (
    <Badge variant={cfg.variant} className={cn(cfg.className, className)}>
      {cfg.label || status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
    </Badge>
  )
}

export function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    LOW: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    MODERATE: 'bg-amber-100 text-amber-700 border-amber-200',
    HIGH: 'bg-orange-100 text-orange-700 border-orange-200',
    CRITICAL: 'bg-red-100 text-red-700 border-red-200',
  }
  return <Badge variant="outline" className={map[severity] || ''}>{severity}</Badge>
}

export function ShiftBadge({ type }: { type: string }) {
  const map: Record<string, string> = {
    DAY: 'bg-amber-100 text-amber-700 border-amber-200',
    EVENING: 'bg-violet-100 text-violet-700 border-violet-200',
    NIGHT: 'bg-slate-700 text-white border-slate-800',
  }
  return <Badge variant="outline" className={map[type] || ''}>{type}</Badge>
}
