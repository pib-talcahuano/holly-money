export type SubItemAmounts = {
  assigned: number
  used: number
  is_active: boolean
}

export type ParentTotals = {
  assigned: number
  used: number
  unassigned_used: number
  remaining: number
}

type ParentInput = {
  // Amount stored on the parent itself; only used when it has no active sub-items.
  storedAssigned: number
  initialUsed: number
  subItems: SubItemAmounts[]
  // Spend that no sub-item claims (requests without a fund / expenses of other categories).
  unassignedUsed: number
}

// Mirrors the SQL summaries: assigned is the sum of ACTIVE sub-items when there is at least one,
// otherwise the stored amount. Deactivated sub-items keep counting their spend. remaining is
// signed (never clamped).
export function aggregateParentTotals(input: ParentInput): ParentTotals {
  const active = input.subItems.filter((s) => s.is_active)
  const assigned =
    active.length > 0 ? active.reduce((sum, s) => sum + s.assigned, 0) : input.storedAssigned
  const used =
    input.initialUsed + input.subItems.reduce((sum, s) => sum + s.used, 0) + input.unassignedUsed
  return { assigned, used, unassigned_used: input.unassignedUsed, remaining: assigned - used }
}
