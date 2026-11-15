import type { MinistryBudgetSummaryRow } from "@/services/ministries/ministry-budget.service"
import type { BudgetItemSummaryRow } from "@/services/ministries/budget-items.service"

export type BudgetRow = {
  kind: "ministry" | "item"
  id: string
  name: string
  categoryName?: string | null
  notes?: string | null
  categoryId?: string | null
  assigned: number | null
  initial: number
  // Automatic part of "used" only (excludes the manual initial amount).
  used: number | null
  remaining: number | null
}

type Ministry = { id: string; name: string; is_active: boolean }

const byName = (a: BudgetRow, b: BudgetRow) => a.name.localeCompare(b.name, "es")

export function buildBudgetRows(
  ministries: Ministry[],
  ministrySummary: MinistryBudgetSummaryRow[],
  itemSummary: BudgetItemSummaryRow[]
): BudgetRow[] {
  const ministryRows: BudgetRow[] = ministries
    .filter((m) => m.is_active)
    .map((m) => {
      const existing = ministrySummary.find((s) => s.ministry_id === m.id)
      return {
        kind: "ministry" as const,
        id: m.id,
        name: m.name,
        assigned: existing?.assigned_amount ?? null,
        initial: existing?.initial_used_amount ?? 0,
        used: existing ? existing.used_amount - existing.initial_used_amount : null,
        remaining: existing?.remaining ?? null
      }
    })
    .sort(byName)

  const itemRows: BudgetRow[] = itemSummary
    .map((i) => ({
      kind: "item" as const,
      id: i.item_id,
      name: i.name,
      categoryName: i.category_name,
      categoryId: i.category_id,
      notes: i.notes,
      assigned: i.assigned_amount,
      initial: i.initial_used_amount,
      used: i.used_amount - i.initial_used_amount,
      remaining: i.remaining
    }))
    .sort(byName)

  return [...ministryRows, ...itemRows]
}

export function sumTotals(rows: BudgetRow[]) {
  return rows.reduce(
    (acc, r) => {
      if (r.assigned === null || r.used === null || r.remaining === null) return acc
      return {
        assigned: acc.assigned + r.assigned,
        initial: acc.initial + r.initial,
        used: acc.used + r.used,
        remaining: acc.remaining + r.remaining
      }
    },
    { assigned: 0, initial: 0, used: 0, remaining: 0 }
  )
}

export type Draft = { assigned?: string; initial?: string }

export type PendingEdit = {
  kind: BudgetRow["kind"]
  id: string
  assigned: number
  initial: number
}

// Rows the user actually edited and can be saved. Untouched rows are never re-sent, so a
// stale tab cannot overwrite what someone else changed.
export function pendingEdits(rows: BudgetRow[], drafts: Record<string, Draft>): PendingEdit[] {
  return rows.flatMap((r) => {
    const draft = drafts[r.id]
    if (!draft) return []
    const assigned = draft.assigned ?? (r.assigned === null ? "" : String(r.assigned))
    if (!assigned) return []
    return [
      {
        kind: r.kind,
        id: r.id,
        assigned: Number(assigned),
        initial: Number(draft.initial ?? r.initial)
      }
    ]
  })
}
