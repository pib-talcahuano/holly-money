/**
 * @jest-environment node
 */
const mockLogSystem = jest.fn()
const mockRpc = jest.fn()

jest.mock("@/services/audit/audit.service", () => ({
  auditService: { logSystem: (...args: unknown[]) => mockLogSystem(...args) }
}))

jest.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ rpc: (...args: unknown[]) => mockRpc(...args) })
}))

import { budgetItemsService } from "../budget-items.service"

const PERIOD_ID = "e2e00000-0000-0000-0000-0000000000b1"
const CATEGORY_ID = "e2e00000-0000-0000-0000-0000000000c1"
const ITEM_ID = "e2e00000-0000-0000-0000-0000000000d1"
const base = {
  budget_period_id: PERIOD_ID,
  name: "Directorio",
  assigned_amount: 1000,
  initial_used_amount: 0
}

type Result = { data: unknown; error: unknown }

// Minimal chainable fake of the Supabase query builder. Every builder method returns
// the same chain; awaiting or .single()/.maybeSingle() resolves per table.
function fakeDb(results: { categoryType?: string | null; write?: Result }) {
  const writes: { table: string; op: string; payload: unknown }[] = []
  const db = {
    from(table: string) {
      const chain: Record<string, unknown> = {}
      const resolveWrite = () =>
        Promise.resolve(results.write ?? { data: { id: ITEM_ID }, error: null })
      for (const op of ["insert", "update"]) {
        chain[op] = (payload: unknown) => {
          writes.push({ table, op, payload })
          return chain
        }
      }
      for (const m of ["select", "eq", "order"]) chain[m] = () => chain
      chain.single = () =>
        table === "movement_categories"
          ? Promise.resolve({
              data: results.categoryType ? { movement_type: results.categoryType } : null,
              error: null
            })
          : resolveWrite()
      chain.maybeSingle = chain.single
      chain.then = (res: (v: Result) => unknown) => resolveWrite().then(res)
      return chain
    }
  }
  return { db: db as never, writes }
}

describe("budgetItemsService.upsertItem", () => {
  beforeEach(() => jest.clearAllMocks())

  it("inserts and audits BUDGET_ITEM_CREATED when there is no id", async () => {
    const { db, writes } = fakeDb({})
    await budgetItemsService.upsertItem(db, base, "user-1")
    expect(writes[0]).toMatchObject({ table: "budget_items", op: "insert" })
    expect(mockLogSystem).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: "BUDGET_ITEM",
        action: "BUDGET_ITEM_CREATED",
        user_id: "user-1"
      })
    )
  })

  it("updates and audits BUDGET_ITEM_UPDATED when there is an id", async () => {
    const { db, writes } = fakeDb({})
    await budgetItemsService.upsertItem(db, { ...base, id: ITEM_ID }, "user-1")
    expect(writes[0]).toMatchObject({ table: "budget_items", op: "update" })
    expect(mockLogSystem).toHaveBeenCalledWith(
      expect.objectContaining({ action: "BUDGET_ITEM_UPDATED" })
    )
  })

  it("turns a unique violation into a friendly Spanish error", async () => {
    const { db } = fakeDb({ write: { data: null, error: { code: "23505", message: "dup" } } })
    await expect(budgetItemsService.upsertItem(db, base, "user-1")).rejects.toThrow(
      "Ya existe un ítem con ese nombre en este período"
    )
    expect(mockLogSystem).not.toHaveBeenCalled()
  })

  it("rejects an INCOME category before writing anything", async () => {
    const { db, writes } = fakeDb({ categoryType: "INCOME" })
    await expect(
      budgetItemsService.upsertItem(db, { ...base, category_id: CATEGORY_ID }, "user-1")
    ).rejects.toThrow("Solo se pueden vincular categorías de egreso")
    expect(writes).toHaveLength(0)
  })

  it("accepts an EXPENSE category", async () => {
    const { db, writes } = fakeDb({ categoryType: "EXPENSE" })
    await budgetItemsService.upsertItem(db, { ...base, category_id: CATEGORY_ID }, "user-1")
    expect(writes).toHaveLength(1)
  })
})

describe("budgetItemsService.setActive", () => {
  beforeEach(() => jest.clearAllMocks())

  it.each([
    [false, "BUDGET_ITEM_DEACTIVATED"],
    [true, "BUDGET_ITEM_ACTIVATED"]
  ])("is_active=%s audits %s", async (isActive, action) => {
    const { db, writes } = fakeDb({})
    await budgetItemsService.setActive(db, { id: ITEM_ID, is_active: isActive }, "user-1")
    expect(writes[0].op).toBe("update")
    expect((writes[0].payload as { is_active: boolean }).is_active).toBe(isActive)
    expect(mockLogSystem).toHaveBeenCalledWith(
      expect.objectContaining({ action, entity_id: ITEM_ID })
    )
  })
})

describe("budgetItemsService.setActive (reactivation)", () => {
  beforeEach(() => jest.clearAllMocks())

  it("turns a name collision on reactivation into the friendly Spanish error", async () => {
    const { db } = fakeDb({ write: { data: null, error: { code: "23505", message: "dup" } } })
    await expect(
      budgetItemsService.setActive(db, { id: ITEM_ID, is_active: true }, "user-1")
    ).rejects.toThrow("Ya existe un ítem con ese nombre en este período")
    expect(mockLogSystem).not.toHaveBeenCalled()
  })
})

describe("budgetItemsService.updateAmounts", () => {
  beforeEach(() => jest.clearAllMocks())

  it("writes only the amounts, never name, category or notes", async () => {
    const { db, writes } = fakeDb({})
    await budgetItemsService.updateAmounts(
      db,
      { id: ITEM_ID, assigned_amount: 900, initial_used_amount: 10 },
      "user-1"
    )
    expect(writes[0].op).toBe("update")
    expect(Object.keys(writes[0].payload as object).sort()).toEqual([
      "assigned_amount",
      "initial_used_amount",
      "updated_at"
    ])
    expect(mockLogSystem).toHaveBeenCalledWith(
      expect.objectContaining({ action: "BUDGET_ITEM_AMOUNTS_UPDATED", entity_id: ITEM_ID })
    )
  })
})

describe("budgetItemsService.getSummary", () => {
  it("calls the RPC with the period id and returns the rows", async () => {
    mockRpc.mockResolvedValue({ data: [{ item_id: ITEM_ID }], error: null })
    const rows = await budgetItemsService.getSummary(PERIOD_ID)
    expect(mockRpc).toHaveBeenCalledWith("get_budget_items_summary", { p_period_id: PERIOD_ID })
    expect(rows).toEqual([{ item_id: ITEM_ID }])
  })
})
