'use client'

import { useState, useMemo, useEffect } from 'react'
import { format, startOfDay, endOfDay, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear, subYears } from 'date-fns'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Button } from '@/components/ui/button'
import { CalendarRange, X } from 'lucide-react'
import { DateRange } from 'react-day-picker'
import { cn } from '@/lib/utils'

export type DateRangeValue = {
  startDate?: string  // ISO yyyy-MM-dd
  endDate?: string    // ISO yyyy-MM-dd
}

type Preset = {
  id: string
  label: string
  build: () => { from: Date; to: Date }
}

const PRESETS: Preset[] = [
  {
    id: 'today',
    label: 'Today',
    build: () => ({ from: startOfDay(new Date()), to: endOfDay(new Date()) }),
  },
  {
    id: 'yesterday',
    label: 'Yesterday',
    build: () => ({ from: startOfDay(subDays(new Date(), 1)), to: endOfDay(subDays(new Date(), 1)) }),
  },
  {
    id: 'last7',
    label: 'Last 7 days',
    build: () => ({ from: startOfDay(subDays(new Date(), 6)), to: endOfDay(new Date()) }),
  },
  {
    id: 'last30',
    label: 'Last 30 days',
    build: () => ({ from: startOfDay(subDays(new Date(), 29)), to: endOfDay(new Date()) }),
  },
  {
    id: 'thisWeek',
    label: 'This week',
    build: () => ({ from: startOfWeek(new Date(), { weekStartsOn: 1 }), to: endOfWeek(new Date(), { weekStartsOn: 1 }) }),
  },
  {
    id: 'lastWeek',
    label: 'Last week',
    build: () => {
      const lastWeekStart = startOfWeek(subDays(new Date(), 7), { weekStartsOn: 1 })
      return { from: lastWeekStart, to: endOfWeek(lastWeekStart, { weekStartsOn: 1 }) }
    },
  },
  {
    id: 'thisMonth',
    label: 'This month',
    build: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }),
  },
  {
    id: 'lastMonth',
    label: 'Last month',
    build: () => ({ from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) }),
  },
  {
    id: 'thisYear',
    label: 'This year',
    build: () => ({ from: startOfYear(new Date()), to: endOfYear(new Date()) }),
  },
  {
    id: 'lastYear',
    label: 'Last year',
    build: () => ({ from: startOfYear(subYears(new Date(), 1)), to: endOfYear(subYears(new Date(), 1)) }),
  },
]

interface DateRangeFilterProps {
  value: DateRangeValue
  onChange: (value: DateRangeValue) => void
  /** Hide the preset buttons row (useful for compact UIs). Defaults to false. */
  hidePresets?: boolean
  /** Field name to display as the trigger label when both dates set (e.g. "Scheduled", "Recorded"). */
  label?: string
  /** Compact mode: smaller trigger button. */
  size?: 'sm' | 'default'
  className?: string
  /** Align popover. Default 'start'. */
  align?: 'start' | 'center' | 'end'
}

/**
 * Reusable date-range filter for any module that displays dated records.
 *
 * - Today / Last 7 / Last 30 / This week / This month / This year / custom range presets
 * - Calendar picker for custom range selection
 * - Trigger button shows current selection summary
 * - Clear button to remove filter
 *
 * Output value: { startDate?: 'yyyy-MM-dd', endDate?: 'yyyy-MM-dd' }
 * — both are inclusive; consumers should use them as day boundaries.
 *
 * Usage:
 *   const [dateRange, setDateRange] = useState<DateRangeValue>({})
 *   <DateRangeFilter value={dateRange} onChange={setDateRange} />
 */
export function DateRangeFilter({
  value,
  onChange,
  hidePresets = false,
  label = 'Date',
  size = 'sm',
  className,
  align = 'start',
}: DateRangeFilterProps) {
  const [open, setOpen] = useState(false)
  const [activePreset, setActivePreset] = useState<string | null>(null)

  // Convert value to DateRange for the calendar component
  const range: DateRange | undefined = useMemo(() => {
    if (!value.startDate && !value.endDate) return undefined
    return {
      from: value.startDate ? new Date(value.startDate) : undefined,
      to: value.endDate ? new Date(value.endDate) : undefined,
    }
  }, [value.startDate, value.endDate])

  // Detect matching preset on open
  useEffect(() => {
    if (!range?.from || !range?.to) {
      setActivePreset(null)
      return
    }
    const match = PRESETS.find(p => {
      const r = p.build()
      return startOfDay(r.from).getTime() === startOfDay(range.from!).getTime()
        && startOfDay(r.to).getTime() === startOfDay(range.to!).getTime()
    })
    setActivePreset(match?.id ?? null)
  }, [range?.from, range?.to])

  const handleSelect = (selected: DateRange | undefined) => {
    if (!selected) {
      onChange({})
      return
    }
    const next: DateRangeValue = {}
    if (selected.from) next.startDate = format(startOfDay(selected.from), 'yyyy-MM-dd')
    if (selected.to) next.endDate = format(endOfDay(selected.to), 'yyyy-MM-dd')
    // If only `from` is set (single-day click), treat as that single day
    if (selected.from && !selected.to) {
      next.endDate = format(endOfDay(selected.from), 'yyyy-MM-dd')
    }
    onChange(next)
  }

  const applyPreset = (preset: Preset) => {
    const r = preset.build()
    onChange({
      startDate: format(r.from, 'yyyy-MM-dd'),
      endDate: format(r.to, 'yyyy-MM-dd'),
    })
    setOpen(false)
  }

  const clear = () => {
    onChange({})
    setOpen(false)
  }

  const triggerLabel = useMemo(() => {
    const { startDate, endDate } = value
    if (!startDate && !endDate) return 'All dates'
    if (startDate && endDate) {
      if (startDate === endDate) {
        return format(new Date(startDate), 'MMM d, yyyy')
      }
      return `${format(new Date(startDate), 'MMM d')} – ${format(new Date(endDate), 'MMM d, yyyy')}`
    }
    if (startDate) return `From ${format(new Date(startDate), 'MMM d, yyyy')}`
    return `Until ${format(new Date(endDate!), 'MMM d, yyyy')}`
  }, [value.startDate, value.endDate])

  const hasValue = !!(value.startDate || value.endDate)

  return (
    <div className={cn('relative inline-flex', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size={size}
            className={cn(
              'gap-1.5 font-normal',
              hasValue && 'border-primary/50 text-primary',
            )}
          >
            <CalendarRange className="h-3.5 w-3.5" />
            <span className="text-xs">{label}:</span>
            <span className="text-xs">{triggerLabel}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent align={align} className="w-auto p-0">
          <div className="flex flex-col sm:flex-row">
            {!hidePresets && (
              <div className="border-b sm:border-b-0 sm:border-r p-2 sm:w-44">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 py-1.5">
                  Presets
                </div>
                <div className="flex sm:flex-col flex-wrap gap-0.5">
                  {PRESETS.map(p => (
                    <button
                      key={p.id}
                      onClick={() => applyPreset(p)}
                      className={cn(
                        'text-xs px-2 py-1.5 rounded text-left hover:bg-muted transition-colors whitespace-nowrap flex-1 sm:flex-none',
                        activePreset === p.id && 'bg-primary/10 text-primary font-medium',
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="p-2">
              <Calendar
                mode="range"
                selected={range}
                onSelect={handleSelect}
                numberOfMonths={1}
                disabled={{ after: new Date() }}
              />
              <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-1 pt-2 border-t mt-1">
                <span className="text-xs text-muted-foreground">
                  {hasValue ? (
                    <>
                      {value.startDate && format(new Date(value.startDate), 'MMM d, yyyy')}
                      {value.startDate && value.endDate && ' → '}
                      {value.endDate && format(new Date(value.endDate), 'MMM d, yyyy')}
                    </>
                  ) : (
                    'Pick a range or preset'
                  )}
                </span>
                <div className="flex gap-1">
                  {hasValue && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={clear}>
                      Clear
                    </Button>
                  )}
                  <Button size="sm" className="h-7 text-xs" onClick={() => setOpen(false)}>
                    Done
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {hasValue && (
        <button
          onClick={clear}
          title="Clear date filter"
          className="absolute -right-2 -top-2 bg-background border border-border rounded-full w-4 h-4 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shadow-sm z-10"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  )
}
