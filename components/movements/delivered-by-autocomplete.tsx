"use client"

import { useEffect, useRef, useState } from "react"
import { suggestDeliveredBy } from "@/app/actions/movements"
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList
} from "@/components/ui/autocomplete"
import type { NameSuggestion } from "@/lib/utils/name-suggestions"

const MIN_QUERY_LENGTH = 2
const DEBOUNCE_MS = 250

interface DeliveredByAutocompleteProps {
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  movementType: "INCOME" | "EXPENSE"
  id?: string
  className?: string
}

export function DeliveredByAutocomplete({
  value,
  onChange,
  onBlur,
  movementType,
  id,
  className
}: DeliveredByAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<NameSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const requestId = useRef(0)
  // Only fetch after the user types; the stored value in edit mode must not trigger a fetch.
  const touched = useRef(false)
  // Choosing a suggestion fills the field; it must not trigger another lookup.
  const pickedValue = useRef<string | null>(null)

  useEffect(() => {
    if (!touched.current) return
    if (pickedValue.current === value) return
    const query = value.trim()
    const current = ++requestId.current
    if (query.length < MIN_QUERY_LENGTH) return
    const timer = setTimeout(() => {
      suggestDeliveredBy(query, movementType)
        .then((data) => {
          if (current === requestId.current) setSuggestions(data)
        })
        .catch(() => {
          if (current === requestId.current) setSuggestions([])
        })
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [value, movementType])

  function handleValueChange(next: string, details: { reason: string }) {
    touched.current = true
    if (details.reason === "item-press") {
      pickedValue.current = next
      requestId.current++
      setSuggestions([])
      setOpen(false)
    } else {
      pickedValue.current = null
      if (next.trim().length < MIN_QUERY_LENGTH) setSuggestions([])
      setOpen(true)
    }
    onChange(next)
  }

  return (
    <Autocomplete
      items={suggestions}
      mode="none"
      open={open && suggestions.length > 0}
      onOpenChange={setOpen}
      value={value}
      onValueChange={handleValueChange}
      itemToStringValue={(item: NameSuggestion) => item.name}
    >
      <AutocompleteInput
        id={id}
        className={className}
        placeholder="Opcional"
        onBlur={onBlur}
        showTrigger={false}
      />
      {suggestions.length > 0 && (
        <AutocompleteContent>
          <AutocompleteList>
            {(item: NameSuggestion) => (
              <AutocompleteItem key={item.name} value={item}>
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                <span className="text-xs text-muted-foreground">
                  {item.count === 1 ? "1 vez" : `${item.count} veces`}
                </span>
              </AutocompleteItem>
            )}
          </AutocompleteList>
        </AutocompleteContent>
      )}
    </Autocomplete>
  )
}
