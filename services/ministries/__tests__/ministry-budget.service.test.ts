/**
 * @jest-environment node
 */
const mockLogSystem = jest.fn()

jest.mock("@/services/audit/audit.service", () => ({
  auditService: { logSystem: (...args: unknown[]) => mockLogSystem(...args) }
}))

jest.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({})
}))

import { ministryBudgetService } from "../ministry-budget.service"

type Result = { data: unknown; error: unknown }

function fakeDb(result: Result) {
  const inserts: unknown[] = []
  const orders: unknown[][] = []
  const chain: Record<string, unknown> = {}
  chain.insert = (payload: unknown) => {
    inserts.push(payload)
    return chain
  }
  chain.select = () => chain
  chain.order = (...args: unknown[]) => {
    orders.push(args)
    return Promise.resolve(result)
  }
  chain.single = () => Promise.resolve(result)
  const db = { from: () => chain }
  return { db: db as never, inserts, orders }
}

describe("ministryBudgetService.createPeriodForYear", () => {
  beforeEach(() => jest.clearAllMocks())

  it("inserts the derived dates and label, and audits the creation", async () => {
    const { db, inserts } = fakeDb({ data: { id: "p-1" }, error: null })
    const data = await ministryBudgetService.createPeriodForYear(db, 2026, "user-1")
    expect(inserts[0]).toEqual({
      year: 2026,
      label: "Presupuesto 2026",
      start_date: "2026-03-01",
      end_date: "2027-02-28",
      created_by: "user-1"
    })
    expect(data).toEqual({ id: "p-1" })
    expect(mockLogSystem).toHaveBeenCalledWith(
      expect.objectContaining({ action: "BUDGET_PERIOD_CREATED", entity_id: "p-1" })
    )
  })

  it("throws a friendly error when the year already exists (23505)", async () => {
    const { db } = fakeDb({ data: null, error: { code: "23505", message: "duplicate" } })
    await expect(ministryBudgetService.createPeriodForYear(db, 2026, "user-1")).rejects.toThrow(
      "Ya existe un presupuesto para ese año"
    )
    expect(mockLogSystem).not.toHaveBeenCalled()
  })
})

describe("ministryBudgetService.upsertBudget without assigned_amount", () => {
  it("updates only the initial amount of the existing row instead of upserting", async () => {
    const calls: { op: string; payload?: unknown; filters: unknown[][] }[] = []
    const chain: Record<string, unknown> = {}
    const filters: unknown[][] = []
    chain.update = (payload: unknown) => {
      calls.push({ op: "update", payload, filters })
      return chain
    }
    chain.upsert = (payload: unknown) => {
      calls.push({ op: "upsert", payload, filters })
      return chain
    }
    chain.eq = (...args: unknown[]) => {
      filters.push(args)
      return chain
    }
    chain.select = () => chain
    chain.single = () => Promise.resolve({ data: { id: "mb-1" }, error: null })
    const db = { from: () => chain } as never
    await ministryBudgetService.upsertBudget(
      db,
      { ministry_id: "m-1", budget_period_id: "p-1", initial_used_amount: 7 },
      "user-1"
    )
    expect(calls).toHaveLength(1)
    expect(calls[0].op).toBe("update")
    expect(Object.keys(calls[0].payload as object).sort()).toEqual([
      "initial_used_amount",
      "updated_at"
    ])
    expect(filters).toEqual([
      ["ministry_id", "m-1"],
      ["budget_period_id", "p-1"]
    ])
  })
})

describe("ministryBudgetService.listPeriods", () => {
  it("orders by year descending", async () => {
    const { db, orders } = fakeDb({ data: [], error: null })
    await ministryBudgetService.listPeriods(db)
    expect(orders[0]).toEqual(["year", { ascending: false }])
  })
})

type Row = Record<string, unknown>

// Stateful in-memory fake: filters (eq / in) apply to selects, inserts add rows.
function memoryDb(
  tables: Record<string, Row[]>,
  failInsert?: (table: string, row: Row) => boolean
) {
  const writes: { table: string; op: string; payload: Row }[] = []
  let seq = 0
  const db = {
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = []
      let inserted: Row | null = null
      const run = () => {
        if (inserted) return [inserted]
        return (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
      }
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (col: string, val: unknown) => (filters.push((r) => r[col] === val), chain),
        in: (col: string, vals: unknown[]) => (filters.push((r) => vals.includes(r[col])), chain),
        insert: (payload: Row) => {
          writes.push({ table, op: "insert", payload })
          if (failInsert?.(table, payload)) {
            return {
              select: () => ({
                single: () => Promise.resolve({ data: null, error: { code: "23505" } })
              }),
              then: (res: (v: unknown) => unknown) =>
                Promise.resolve({ data: null, error: { code: "23505" } }).then(res)
            }
          }
          inserted = { id: `new-${++seq}`, is_active: true, ...payload }
          tables[table] = [...(tables[table] ?? []), inserted]
          return chain
        },
        single: () => Promise.resolve({ data: run()[0] ?? null, error: null }),
        maybeSingle: () => Promise.resolve({ data: run()[0] ?? null, error: null }),
        then: (res: (v: unknown) => unknown) =>
          Promise.resolve({ data: run(), error: null }).then(res)
      }
      return chain
    }
  }
  return { db: db as never, tables, writes }
}

const SRC = "period-src"
const DST = "period-dst"

function fixtures(): Record<string, Row[]> {
  return {
    ministry_budgets: [
      {
        id: "mb-1",
        ministry_id: "m-1",
        budget_period_id: SRC,
        assigned_amount: 500,
        initial_used_amount: 90,
        notes: "n1"
      }
    ],
    budget_items: [
      {
        id: "it-1",
        budget_period_id: SRC,
        name: "Aseo",
        category_id: "c-1",
        assigned_amount: 300,
        initial_used_amount: 40,
        notes: null,
        is_active: true
      },
      {
        id: "it-2",
        budget_period_id: SRC,
        name: "Inactivo",
        category_id: null,
        assigned_amount: 10,
        initial_used_amount: 0,
        notes: null,
        is_active: false
      }
    ],
    budget_sub_items: [
      {
        id: "s-1",
        ministry_budget_id: "mb-1",
        budget_item_id: null,
        name: "Viajes",
        assigned_amount: 200,
        notes: "x",
        category_id: null,
        is_active: true
      },
      {
        id: "s-2",
        ministry_budget_id: null,
        budget_item_id: "it-1",
        name: "Cloro",
        assigned_amount: 100,
        notes: null,
        category_id: "c-9",
        is_active: true
      },
      {
        id: "s-3",
        ministry_budget_id: null,
        budget_item_id: "it-1",
        name: "Cloro dos",
        assigned_amount: 50,
        notes: null,
        category_id: "c-9",
        is_active: true
      },
      {
        id: "s-4",
        ministry_budget_id: "mb-1",
        budget_item_id: null,
        name: "Apagado",
        assigned_amount: 5,
        notes: null,
        category_id: null,
        is_active: false
      }
    ]
  }
}

describe("ministryBudgetService.copyFromPeriod", () => {
  beforeEach(() => jest.clearAllMocks())

  it("rejects identical source and target", async () => {
    const { db } = memoryDb(fixtures())
    await expect(
      ministryBudgetService.copyFromPeriod(
        db,
        { from_period_id: SRC, to_period_id: SRC, scope: "ALL" },
        "u-1"
      )
    ).rejects.toThrow("El período de origen y destino deben ser distintos")
  })

  it("ALL copies parents and active sub-items with initial_used_amount 0, never writing the source", async () => {
    const { db, tables, writes } = memoryDb(fixtures())
    const result = await ministryBudgetService.copyFromPeriod(
      db,
      { from_period_id: SRC, to_period_id: DST, scope: "ALL" },
      "u-1"
    )

    // s-3 shares category c-9 with s-2 under the same item: skipped, not a crash.
    expect(result).toEqual({
      copied: { ministry_budgets: 1, budget_items: 1, sub_items: 2 },
      skipped: { ministry_budgets: 0, budget_items: 0, sub_items: 1 }
    })
    expect(writes.every((w) => w.payload.budget_period_id !== SRC)).toBe(true)
    expect(writes.filter((w) => w.table === "ministry_budgets")[0].payload).toEqual({
      ministry_id: "m-1",
      budget_period_id: DST,
      assigned_amount: 500,
      initial_used_amount: 0,
      notes: "n1",
      created_by: "u-1"
    })
    expect(writes.filter((w) => w.table === "budget_items")[0].payload).toMatchObject({
      budget_period_id: DST,
      name: "Aseo",
      category_id: "c-1",
      assigned_amount: 300,
      initial_used_amount: 0
    })
    const subs = writes.filter((w) => w.table === "budget_sub_items").map((w) => w.payload)
    expect(subs).toHaveLength(2)
    expect(subs[0]).toMatchObject({
      name: "Viajes",
      assigned_amount: 200,
      notes: "x",
      category_id: null
    })
    expect(subs[1]).toMatchObject({ name: "Cloro", category_id: "c-9" })
    // Source rows untouched.
    expect(tables.ministry_budgets[0]).toMatchObject({ initial_used_amount: 90 })
    expect(mockLogSystem).toHaveBeenCalledTimes(1)
    expect(mockLogSystem).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: "BUDGET_PERIOD",
        action: "BUDGET_COPIED",
        new_value: {
          from_period_id: SRC,
          to_period_id: DST,
          scope: "ALL",
          copied: result.copied,
          skipped: result.skipped
        }
      })
    )
  })

  it("copying twice is idempotent: the second run copies nothing", async () => {
    const { db, writes } = memoryDb(fixtures())
    const input = { from_period_id: SRC, to_period_id: DST, scope: "ALL" as const }
    await ministryBudgetService.copyFromPeriod(db, input, "u-1")
    const before = writes.length
    const second = await ministryBudgetService.copyFromPeriod(db, input, "u-1")

    expect(writes).toHaveLength(before)
    expect(second.copied).toEqual({ ministry_budgets: 0, budget_items: 0, sub_items: 0 })
    expect(second.skipped).toEqual({ ministry_budgets: 1, budget_items: 1, sub_items: 3 })
  })

  it("{ sub_item_id } creates the missing parent with amount 0 and copies just that sub-item", async () => {
    const { db, writes } = memoryDb(fixtures())
    const result = await ministryBudgetService.copyFromPeriod(
      db,
      { from_period_id: SRC, to_period_id: DST, scope: { sub_item_id: "s-1" } },
      "u-1"
    )

    expect(result.copied).toEqual({ ministry_budgets: 1, budget_items: 0, sub_items: 1 })
    expect(writes[0]).toMatchObject({
      table: "ministry_budgets",
      payload: { assigned_amount: 0, initial_used_amount: 0, budget_period_id: DST }
    })
    expect(writes[1]).toMatchObject({ table: "budget_sub_items", payload: { name: "Viajes" } })
  })

  it("{ ministry_id } copies only that ministry's budget and its sub-items", async () => {
    const { db, writes } = memoryDb(fixtures())
    const result = await ministryBudgetService.copyFromPeriod(
      db,
      { from_period_id: SRC, to_period_id: DST, scope: { ministry_id: "m-1" } },
      "u-1"
    )
    expect(result.copied).toEqual({ ministry_budgets: 1, budget_items: 0, sub_items: 1 })
    expect(writes.some((w) => w.table === "budget_items")).toBe(false)
  })

  it("{ budget_item_id } copies the item and its sub-items, skipping a category clash", async () => {
    const { db } = memoryDb(fixtures())
    const result = await ministryBudgetService.copyFromPeriod(
      db,
      { from_period_id: SRC, to_period_id: DST, scope: { budget_item_id: "it-1" } },
      "u-1"
    )
    expect(result.copied).toEqual({ ministry_budgets: 0, budget_items: 1, sub_items: 1 })
    expect(result.skipped.sub_items).toBe(1)
  })

  it("counts a unique violation on a sub-item insert as skipped instead of failing", async () => {
    const { db } = memoryDb(
      fixtures(),
      (table, row) => table === "budget_sub_items" && row.name === "Viajes"
    )
    const result = await ministryBudgetService.copyFromPeriod(
      db,
      { from_period_id: SRC, to_period_id: DST, scope: { ministry_id: "m-1" } },
      "u-1"
    )
    expect(result.copied.sub_items).toBe(0)
    expect(result.skipped.sub_items).toBe(1)
  })
})
