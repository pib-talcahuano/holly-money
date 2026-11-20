/**
 * @jest-environment node
 */
const mockLogSystem = jest.fn()

jest.mock("@/services/audit/audit.service", () => ({
  auditService: { logSystem: (...args: unknown[]) => mockLogSystem(...args) }
}))

import { budgetSubItemsService } from "../budget-sub-items.service"

const BUDGET_ID = "e2e00000-0000-0000-0000-0000000000b1"
const ITEM_ID = "e2e00000-0000-0000-0000-0000000000d1"
const SUB_ID = "e2e00000-0000-0000-0000-0000000000e1"
const CATEGORY_ID = "e2e00000-0000-0000-0000-0000000000c1"
const underItem = { budget_item_id: ITEM_ID, name: "Viajes", assigned_amount: 100 }
const underMinistry = { ministry_budget_id: BUDGET_ID, name: "Viajes", assigned_amount: 100 }

type Result = { data: unknown; error: unknown }

function fakeDb(results: { categoryType?: string | null; write?: Result; list?: Result }) {
  const writes: { table: string; op: string; payload: unknown }[] = []
  const filters: [string, unknown][] = []
  const db = {
    from(table: string) {
      const chain: Record<string, unknown> = {}
      const resolveWrite = () =>
        Promise.resolve(results.write ?? { data: { id: SUB_ID }, error: null })
      for (const op of ["insert", "update"]) {
        chain[op] = (payload: unknown) => {
          writes.push({ table, op, payload })
          return chain
        }
      }
      chain.eq = (col: string, val: unknown) => {
        filters.push([col, val])
        return chain
      }
      for (const m of ["select", "order"]) chain[m] = () => chain
      chain.single = () =>
        table === "movement_categories"
          ? Promise.resolve({
              data: results.categoryType ? { movement_type: results.categoryType } : null,
              error: null
            })
          : resolveWrite()
      chain.maybeSingle = chain.single
      chain.then = (res: (v: Result) => unknown) =>
        Promise.resolve(results.list ?? { data: [], error: null }).then(res)
      return chain
    }
  }
  return { db: db as never, writes, filters }
}

describe("budgetSubItemsService.upsert", () => {
  beforeEach(() => jest.clearAllMocks())

  it("inserts under a ministry budget and audits BUDGET_SUB_ITEM_CREATED", async () => {
    const { db, writes } = fakeDb({})
    await budgetSubItemsService.upsert(db, underMinistry, "user-1")
    expect(writes[0]).toMatchObject({ table: "budget_sub_items", op: "insert" })
    expect(mockLogSystem).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: "BUDGET_SUB_ITEM",
        action: "BUDGET_SUB_ITEM_CREATED",
        user_id: "user-1"
      })
    )
  })

  it("updates and audits BUDGET_SUB_ITEM_UPDATED when there is an id", async () => {
    const { db, writes } = fakeDb({})
    await budgetSubItemsService.upsert(db, { ...underItem, id: SUB_ID }, "user-1")
    expect(writes[0]).toMatchObject({ op: "update" })
    expect(mockLogSystem).toHaveBeenCalledWith(
      expect.objectContaining({ action: "BUDGET_SUB_ITEM_UPDATED", entity_id: SUB_ID })
    )
  })

  it("rejects a category on a ministry sub-item before writing", async () => {
    const { db, writes } = fakeDb({ categoryType: "EXPENSE" })
    await expect(
      budgetSubItemsService.upsert(db, { ...underMinistry, category_id: CATEGORY_ID }, "user-1")
    ).rejects.toThrow("Los sub-ítems de ministerio no pueden tener categoría")
    expect(writes).toHaveLength(0)
  })

  it("rejects an INCOME category on a budget item sub-item", async () => {
    const { db, writes } = fakeDb({ categoryType: "INCOME" })
    await expect(
      budgetSubItemsService.upsert(db, { ...underItem, category_id: CATEGORY_ID }, "user-1")
    ).rejects.toThrow("Solo se pueden vincular categorías de egreso")
    expect(writes).toHaveLength(0)
  })

  it("accepts an EXPENSE category on a budget item sub-item", async () => {
    const { db, writes } = fakeDb({ categoryType: "EXPENSE" })
    await budgetSubItemsService.upsert(db, { ...underItem, category_id: CATEGORY_ID }, "user-1")
    expect(writes).toHaveLength(1)
  })

  it("turns a unique violation into the friendly Spanish error", async () => {
    const { db } = fakeDb({ write: { data: null, error: { code: "23505", message: "dup" } } })
    await expect(budgetSubItemsService.upsert(db, underItem, "user-1")).rejects.toThrow(
      "Ya existe un sub-ítem con ese nombre"
    )
    expect(mockLogSystem).not.toHaveBeenCalled()
  })
})

describe("budgetSubItemsService.setActive", () => {
  beforeEach(() => jest.clearAllMocks())

  it("audits BUDGET_SUB_ITEM_DEACTIVATED", async () => {
    const { db, writes } = fakeDb({})
    await budgetSubItemsService.setActive(db, { id: SUB_ID, is_active: false }, "user-1")
    expect((writes[0].payload as { is_active: boolean }).is_active).toBe(false)
    expect(mockLogSystem).toHaveBeenCalledWith(
      expect.objectContaining({ action: "BUDGET_SUB_ITEM_DEACTIVATED", entity_id: SUB_ID })
    )
  })

  it("audits reactivation as BUDGET_SUB_ITEM_UPDATED", async () => {
    const { db } = fakeDb({})
    await budgetSubItemsService.setActive(db, { id: SUB_ID, is_active: true }, "user-1")
    expect(mockLogSystem).toHaveBeenCalledWith(
      expect.objectContaining({ action: "BUDGET_SUB_ITEM_UPDATED" })
    )
  })

  it("turns a name collision on reactivation into the friendly error", async () => {
    const { db } = fakeDb({ write: { data: null, error: { code: "23505", message: "dup" } } })
    await expect(
      budgetSubItemsService.setActive(db, { id: SUB_ID, is_active: true }, "user-1")
    ).rejects.toThrow("Ya existe un sub-ítem con ese nombre")
  })
})

describe("budgetSubItemsService.list", () => {
  it("filters by ministry budget parent and active rows", async () => {
    const { db, filters } = fakeDb({ list: { data: [{ id: SUB_ID }], error: null } })
    const rows = await budgetSubItemsService.list(db, { ministry_budget_id: BUDGET_ID })
    expect(rows).toEqual([{ id: SUB_ID }])
    expect(filters).toContainEqual(["ministry_budget_id", BUDGET_ID])
  })

  it("filters by budget item parent", async () => {
    const { db, filters } = fakeDb({ list: { data: [], error: null } })
    await budgetSubItemsService.list(db, { budget_item_id: ITEM_ID })
    expect(filters).toContainEqual(["budget_item_id", ITEM_ID])
  })
})
