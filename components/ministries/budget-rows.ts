import type { MinistryBudgetSummaryRow } from "@/services/ministries/ministry-budget.service"
import type { BudgetItemSummaryRow } from "@/services/ministries/budget-items.service"
import type { BudgetSubItemSummaryRow } from "@/services/ministries/budget-sub-items.service"

export type SubItemRow = {
  id: string
  name: string
  assigned: number
  used: number
  remaining: number
}

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
  // Active sub-items of this parent, sorted by name.
  children: SubItemRow[]
  // True when `assigned` is the sum of the children instead of an editable stored amount.
  derived: boolean
  // Spend that no sub-item claims ("Sin asignar").
  unassignedUsed: number
}

type Ministry = { id: string; name: string; is_active: boolean }

const byName = (a: BudgetRow, b: BudgetRow) => a.name.localeCompare(b.name, "es")

const toSubItemRow = (s: BudgetSubItemSummaryRow): SubItemRow => ({
  id: s.sub_item_id,
  name: s.name,
  assigned: s.assigned_amount,
  used: s.used_amount,
  remaining: s.remaining
})

const childrenOf = (
  subItems: BudgetSubItemSummaryRow[],
  isChild: (s: BudgetSubItemSummaryRow) => boolean
) =>
  subItems
    .filter(isChild)
    .map(toSubItemRow)
    .sort((a, b) => a.name.localeCompare(b.name, "es"))

// With sub-items the parent's total is their sum (shared helper, same rule as the SQL summaries);
// "used" is the summary's own figure (it also counts spend of deactivated sub-items).
function withChildren<T extends Pick<BudgetRow, "assigned" | "initial" | "used" | "remaining">>(
  base: T,
  children: SubItemRow[],
  unassignedUsed: number
): T & Pick<BudgetRow, "children" | "derived" | "unassignedUsed"> {
  if (children.length === 0) return { ...base, children, derived: false, unassignedUsed }
  const assigned = children.reduce((sum, c) => sum + c.assigned, 0)
  const used = base.used ?? 0
  return {
    ...base,
    assigned,
    remaining: assigned - (base.initial + used),
    children,
    derived: true,
    unassignedUsed
  }
}

export function buildBudgetRows(
  ministries: Ministry[],
  ministrySummary: MinistryBudgetSummaryRow[],
  itemSummary: BudgetItemSummaryRow[],
  subItemSummary: BudgetSubItemSummaryRow[] = []
): BudgetRow[] {
  const ministryRows: BudgetRow[] = ministries
    .filter((m) => m.is_active)
    .map((m) => {
      const existing = ministrySummary.find((s) => s.ministry_id === m.id)
      const base = {
        kind: "ministry" as const,
        id: m.id,
        name: m.name,
        assigned: existing?.assigned_amount ?? null,
        initial: existing?.initial_used_amount ?? 0,
        used: existing ? existing.used_amount - existing.initial_used_amount : null,
        remaining: existing?.remaining ?? null
      }
      return withChildren(
        base,
        childrenOf(subItemSummary, (s) => s.parent_type === "MINISTRY" && s.ministry_id === m.id),
        existing?.unassigned_used ?? 0
      )
    })
    .sort(byName)

  const itemRows: BudgetRow[] = itemSummary
    .map((i) =>
      withChildren(
        {
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
        },
        childrenOf(
          subItemSummary,
          (s) => s.parent_type === "ITEM" && s.budget_item_id === i.item_id
        ),
        i.unassigned_used ?? 0
      )
    )
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
  // undefined for a derived parent: its stored amount must not be overwritten by the sum.
  assigned: number | undefined
  initial: number
}

// Rows the user actually edited and can be saved. Untouched rows are never re-sent, so a
// stale tab cannot overwrite what someone else changed.
export function pendingEdits(rows: BudgetRow[], drafts: Record<string, Draft>): PendingEdit[] {
  return rows.flatMap((r) => {
    const draft = drafts[r.id]
    if (!draft) return []
    const assigned = draft.assigned ?? (r.assigned === null ? "" : String(r.assigned))
    if (!assigned && !r.derived) return []
    return [
      {
        kind: r.kind,
        id: r.id,
        assigned: r.derived ? undefined : Number(assigned),
        initial: Number(draft.initial ?? r.initial)
      }
    ]
  })
}
