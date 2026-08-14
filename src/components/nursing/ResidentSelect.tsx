'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { Search, ChevronDown, X, Check } from 'lucide-react'

interface Resident {
  id: string
  code?: string | null
  firstName: string
  lastName: string
  room?: { roomNumber?: string | null } | null
  status?: string
}

interface ResidentSelectProps {
  residents: Resident[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
  allowAll?: boolean             // show "All residents" option at the top
  allLabel?: string              // label for the "All" option, e.g. "All residents"
  allowClear?: boolean           // show a clear (×) button next to selected
  className?: string
  disabled?: boolean
  required?: boolean
}

/**
 * Searchable resident dropdown.
 * - Type to filter by code, name, or room number.
 * - Each option shows: CODE — First Last (Room X).
 * - Keyboard accessible: ↑/↓ to navigate, Enter to select, Esc to close.
 */
export function ResidentSelect({
  residents,
  value,
  onChange,
  placeholder = '— Select resident —',
  allowAll = false,
  allLabel = 'All residents',
  allowClear = false,
  className = '',
  disabled = false,
  required = false,
}: ResidentSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightIdx, setHighlightIdx] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const selected = residents.find(r => r.id === value) || null

  const filtered = useMemo(() => {
    if (!query.trim()) return residents
    const q = query.toLowerCase().trim()
    return residents.filter(r => {
      const name = `${r.firstName} ${r.lastName}`.toLowerCase()
      const code = (r.code || '').toLowerCase()
      const room = (r.room?.roomNumber || '').toLowerCase()
      return name.includes(q) || code.includes(q) || room.includes(q)
    })
  }, [residents, query])

  // Reset highlight when filter changes
  useEffect(() => { setHighlightIdx(0) }, [query, open])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  // Focus the search input when opening
  useEffect(() => {
    if (open && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [open])

  const selectItem = (id: string) => {
    onChange(id)
    setOpen(false)
    setQuery('')
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      setOpen(true)
      return
    }
    if (!open) return
    if (e.key === 'Escape') { setOpen(false); setQuery('') }
    else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx(i => Math.min(i + 1, filtered.length - 1 + (allowAll ? 1 : 0)))
    }
    else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx(i => Math.max(i - 1, 0))
    }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (allowAll && highlightIdx === 0) selectItem('')
      else {
        const idx = allowAll ? highlightIdx - 1 : highlightIdx
        if (filtered[idx]) selectItem(filtered[idx].id)
      }
    }
  }

  const displayLabel = selected
    ? `${selected.code ? selected.code + ' — ' : ''}${selected.firstName} ${selected.lastName}${selected.room?.roomNumber ? ` (Room ${selected.room.roomNumber})` : ''}`
    : (value === '' && allowAll ? allLabel : placeholder)

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <div
        className={`flex items-center gap-1 border rounded px-2 py-1.5 text-sm bg-background cursor-pointer ${disabled ? 'opacity-60 cursor-not-allowed' : 'hover:border-primary'}`}
        onClick={() => !disabled && setOpen(o => !o)}
        onKeyDown={handleKey}
        tabIndex={disabled ? -1 : 0}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className={`flex-1 truncate text-left ${!selected && !(value === '' && allowAll) ? 'text-muted-foreground' : ''}`}>
          {displayLabel}
        </span>
        {allowClear && selected && (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground p-0.5"
            onClick={(e) => { e.stopPropagation(); selectItem('') }}
            title="Clear"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </div>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-background border rounded-md shadow-lg max-h-72 flex flex-col">
          {/* Search bar */}
          <div className="p-2 border-b sticky top-0 bg-background">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Search by code, name, or room..."
                className="w-full pl-7 pr-2 py-1.5 text-sm border rounded outline-none focus:border-primary"
              />
            </div>
          </div>
          {/* Options list */}
          <div className="overflow-y-auto flex-1">
            {allowAll && (
              <button
                type="button"
                className={`w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between ${highlightIdx === 0 ? 'bg-muted' : ''} ${value === '' ? 'font-medium text-primary' : ''}`}
                onClick={() => selectItem('')}
              >
                <span>{allLabel}</span>
                {value === '' && <Check className="h-3.5 w-3.5" />}
              </button>
            )}
            {filtered.length === 0 && !allowAll && (
              <div className="px-3 py-4 text-sm text-muted-foreground text-center">No residents match "{query}"</div>
            )}
            {filtered.length === 0 && allowAll && (
              <div className="px-3 py-2 text-xs text-muted-foreground text-center">No residents match "{query}"</div>
            )}
            {filtered.map((r, idx) => {
              const realIdx = allowAll ? idx + 1 : idx
              const isSelected = r.id === value
              return (
                <button
                  key={r.id}
                  type="button"
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between gap-2 ${highlightIdx === realIdx ? 'bg-muted' : ''} ${isSelected ? 'font-medium' : ''}`}
                  onClick={() => selectItem(r.id)}
                  onMouseEnter={() => setHighlightIdx(realIdx)}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    {r.code && <span className="font-mono text-[11px] text-primary bg-primary/5 px-1 py-0.5 rounded flex-shrink-0">{r.code}</span>}
                    <span className="truncate">{r.firstName} {r.lastName}</span>
                    {r.room?.roomNumber && <span className="text-xs text-muted-foreground flex-shrink-0">Room {r.room.roomNumber}</span>}
                  </span>
                  {isSelected && <Check className="h-3.5 w-3.5 text-primary flex-shrink-0" />}
                </button>
              )
            })}
          </div>
          {filtered.length > 0 && (
            <div className="px-3 py-1.5 border-t text-[10px] text-muted-foreground sticky bottom-0 bg-background">
              {filtered.length} resident{filtered.length !== 1 ? 's' : ''}{query && ` matched "${query}"`}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
