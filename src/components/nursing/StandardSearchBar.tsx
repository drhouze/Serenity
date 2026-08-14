'use client'

import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface StandardSearchBarProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  totalCount?: number
  filteredCount?: number
  className?: string
}

/**
 * Standardised search bar used across Residents, Rooms, MAR, Incidents, Finance,
 * Messages, Inventory, and Audit Log modules.
 *
 * Features:
 * - Search icon on the left
 * - Clear (×) button on the right (only shown when there's text)
 * - Optional result count display ("Showing 5 of 20")
 * - Consistent styling and behaviour across all modules
 */
export function StandardSearchBar({
  value,
  onChange,
  placeholder = 'Search...',
  totalCount,
  filteredCount,
  className = '',
}: StandardSearchBarProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="pl-9 pr-9"
        />
        {value && (
          <button
            onClick={() => onChange('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            title="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {totalCount !== undefined && filteredCount !== undefined && (
        <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
          Showing {filteredCount} of {totalCount}
        </span>
      )}
    </div>
  )
}
