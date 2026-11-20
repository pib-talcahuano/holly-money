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

describe("ministryBudgetService.listPeriods", () => {
  it("orders by year descending", async () => {
    const { db, orders } = fakeDb({ data: [], error: null })
    await ministryBudgetService.listPeriods(db)
    expect(orders[0]).toEqual(["year", { ascending: false }])
  })
})
