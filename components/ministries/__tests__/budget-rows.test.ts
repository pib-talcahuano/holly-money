import { buildBudgetRows, pendingEdits, sumTotals } from "../budget-rows"
import type { MinistryBudgetSummaryRow } from "@/services/ministries/ministry-budget.service"
import type { BudgetItemSummaryRow } from "@/services/ministries/budget-items.service"

const ministry = (id: string, name: string, is_active = true) => ({ id, name, is_active })

const ministryRow = (ministry_id: string, assigned: number, initial: number, used: number) =>
  ({
    ministry_id,
    ministry_name: "",
    period_id: "p",
    period_label: "p",
    period_start_date: "2026-01-01",
    period_end_date: "2026-12-31",
    assigned_amount: assigned,
    initial_used_amount: initial,
    used_amount: used,
    remaining: assigned - used
  }) as MinistryBudgetSummaryRow

const itemRow = (item_id: string, name: string, assigned: number, initial: number, used: number) =>
  ({
    item_id,
    name,
    category_id: null,
    category_name: null,
    notes: null,
    assigned_amount: assigned,
    initial_used_amount: initial,
    used_amount: used,
    remaining: assigned - used
  }) as BudgetItemSummaryRow

describe("buildBudgetRows", () => {
  it("puts every ministry before every item, each group sorted by name", () => {
    const rows = buildBudgetRows(
      [ministry("m2", "Zeta"), ministry("m1", "Alfa")],
      [],
      [itemRow("i2", "Remuneraciones", 10, 0, 0), itemRow("i1", "Asociaciones", 10, 0, 0)]
    )
    expect(rows.map((r) => `${r.kind}:${r.name}`)).toEqual([
      "ministry:Alfa",
      "ministry:Zeta",
      "item:Asociaciones",
      "item:Remuneraciones"
    ])
  })

  it("excludes inactive ministries", () => {
    const rows = buildBudgetRows([ministry("m1", "Alfa"), ministry("m2", "Beta", false)], [], [])
    expect(rows.map((r) => r.name)).toEqual(["Alfa"])
  })

  it("leaves a ministry without a budget row unassigned (nulls, initial 0)", () => {
    const [row] = buildBudgetRows([ministry("m1", "Alfa")], [], [])
    expect(row).toMatchObject({ assigned: null, initial: 0, used: null, remaining: null })
  })

  it("reports used as the automatic part only (used_amount - initial)", () => {
    const [row] = buildBudgetRows([ministry("m1", "Alfa")], [ministryRow("m1", 1000, 100, 350)], [])
    expect(row).toMatchObject({ assigned: 1000, initial: 100, used: 250, remaining: 650 })
  })

  it("keeps a ministry and an item with the same name as separate rows", () => {
    const rows = buildBudgetRows(
      [ministry("m1", "Directorio")],
      [],
      [itemRow("i1", "Directorio", 5, 0, 0)]
    )
    expect(rows.map((r) => r.kind)).toEqual(["ministry", "item"])
  })
})

describe("sumTotals", () => {
  it("sums assigned, initial, auto used and remaining so each column adds up", () => {
    const rows = buildBudgetRows(
      [ministry("m1", "Alfa"), ministry("m2", "Beta")],
      [ministryRow("m1", 1000, 100, 350)],
      [itemRow("i1", "Directorio", 500, 0, 120)]
    )
    expect(sumTotals(rows)).toEqual({ assigned: 1500, initial: 100, used: 370, remaining: 1030 })
  })

  it("ignores ministries that have no budget row", () => {
    const rows = buildBudgetRows([ministry("m1", "Alfa")], [], [])
    expect(sumTotals(rows)).toEqual({ assigned: 0, initial: 0, used: 0, remaining: 0 })
  })
})

describe("pendingEdits", () => {
  const rows = buildBudgetRows(
    [ministry("m1", "Alfa"), ministry("m2", "Beta")],
    [ministryRow("m1", 1000, 100, 350), ministryRow("m2", 500, 0, 0)],
    [itemRow("i1", "Directorio", 500, 20, 120)]
  )

  it("returns nothing when there are no drafts", () => {
    expect(pendingEdits(rows, {})).toEqual([])
  })

  it("returns only rows the user edited, keeping their kind", () => {
    const edits = pendingEdits(rows, { m2: { assigned: "700" }, i1: { initial: "30" } })
    expect(edits).toEqual([
      { kind: "ministry", id: "m2", assigned: 700, initial: 0 },
      { kind: "item", id: "i1", assigned: 500, initial: 30 }
    ])
  })

  it("skips an edited row whose assigned amount was cleared", () => {
    expect(pendingEdits(rows, { m1: { assigned: "" } })).toEqual([])
  })

  it("skips an edited ministry that has no saved budget and no assigned amount", () => {
    const unassigned = buildBudgetRows([ministry("m9", "Zeta")], [], [])
    expect(pendingEdits(unassigned, { m9: { initial: "5" } })).toEqual([])
  })
})
