import { intentionsService } from "../intentions.service"
import { auditService } from "@/services/audit/audit.service"

jest.mock("@/services/audit/audit.service", () => ({
  auditService: { logSystem: jest.fn().mockResolvedValue(undefined) }
}))
jest.mock("@/services/email/workflow-emails.service", () => ({
  sendIntentionNotification: jest.fn(),
  sendIntentionReviewNotification: jest.fn(),
  sendTransferNotification: jest.fn()
}))
jest.mock("@/lib/utils/run-after-response", () => ({ runAfterResponse: jest.fn() }))

function fakeDb(rows: { purpose: string | null }[]) {
  const eq = jest.fn()
  const order = jest.fn()
  const limit = jest.fn().mockResolvedValue({ data: rows, error: null })
  const select = jest.fn(() => ({ eq }))
  eq.mockReturnValue({ order })
  order.mockReturnValue({ limit })

  return {
    db: { from: jest.fn(() => ({ select })) } as never,
    eq,
    order,
    limit
  }
}

describe("intentionsService.listRecentPurposes", () => {
  it("dedupes case-insensitively, keeping the most recent casing", async () => {
    const { db } = fakeDb([
      { purpose: "Campamento" },
      { purpose: "campamento " },
      { purpose: "Otro propósito" }
    ])

    const result = await intentionsService.listRecentPurposes(db, "user-1")

    expect(result).toEqual(["Campamento", "Otro propósito"])
  })

  it("caps the result at the given limit", async () => {
    const { db } = fakeDb([{ purpose: "A" }, { purpose: "B" }, { purpose: "C" }])

    const result = await intentionsService.listRecentPurposes(db, "user-1", 2)

    expect(result).toEqual(["A", "B"])
  })

  it("filters by the requesting user", async () => {
    const { db, eq } = fakeDb([{ purpose: "Solo mío" }])

    await intentionsService.listRecentPurposes(db, "user-42")

    expect(eq).toHaveBeenCalledWith("requested_by", "user-42")
  })

  it("returns an empty array for a user with no prior requests", async () => {
    const { db } = fakeDb([])

    const result = await intentionsService.listRecentPurposes(db, "user-1")

    expect(result).toEqual([])
  })

  it("skips null purposes without throwing", async () => {
    const { db } = fakeDb([{ purpose: null }, { purpose: "Válido" }])

    const result = await intentionsService.listRecentPurposes(db, "user-1")

    expect(result).toEqual(["Válido"])
  })

  it("preserves most-recent-first ordering from the query", async () => {
    const { db } = fakeDb([{ purpose: "Más reciente" }, { purpose: "Más antiguo" }])

    const result = await intentionsService.listRecentPurposes(db, "user-1")

    expect(result).toEqual(["Más reciente", "Más antiguo"])
  })

  it("throws when the query errors", async () => {
    const { db, limit } = fakeDb([])
    limit.mockResolvedValue({ data: null, error: new Error("boom") })

    await expect(intentionsService.listRecentPurposes(db, "user-1")).rejects.toThrow("boom")
  })
})

// Chainable fake: every builder method returns the same chain; awaiting / single() resolve
// to the next queued result for that table call.
function chainDb(results: Record<string, { data?: unknown; error?: unknown }[]>) {
  const calls: { table: string; method: string; args: unknown[] }[] = []
  const db = {
    from: (table: string) => {
      const result = (results[table] ?? []).shift() ?? { data: null, error: null }
      const chain: Record<string, unknown> = {}
      for (const method of ["select", "update", "eq", "limit"]) {
        chain[method] = (...args: unknown[]) => {
          calls.push({ table, method, args })
          return chain
        }
      }
      chain.single = () =>
        Promise.resolve({ data: result.data ?? null, error: result.error ?? null })
      chain.maybeSingle = chain.single
      chain.then = (resolve: (v: unknown) => unknown) =>
        resolve({ data: result.data ?? null, error: result.error ?? null, count: 0 })
      return chain
    }
  }
  return { db: db as never, calls }
}

const logSystem = auditService.logSystem as jest.Mock

describe("intentionsService.review fund", () => {
  beforeEach(() => logSystem.mockClear())

  it("stores the fund and audits it when approving", async () => {
    const { db, calls } = chainDb({
      budget_intentions: [
        { data: { status: "PENDING", users: null } },
        { data: { id: "i1", ministry_id: "m1" } }
      ]
    })
    await intentionsService.review(
      db,
      "i1",
      { action: "APPROVED", message: "ok", fund_sub_item_id: "sub-1" },
      "u1"
    )
    const update = calls.find((c) => c.method === "update")!
    expect(update.args[0]).toMatchObject({ status: "APPROVED", budget_sub_item_id: "sub-1" })
    expect(logSystem).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "INTENTION_APPROVED",
        new_value: expect.objectContaining({ budget_sub_item_id: "sub-1" }) as unknown
      })
    )
  })

  it("ignores the fund when rejecting", async () => {
    const { db, calls } = chainDb({
      budget_intentions: [{ data: { status: "PENDING", users: null } }, { data: { id: "i1" } }]
    })
    await intentionsService.review(
      db,
      "i1",
      { action: "REJECTED", message: "no", fund_sub_item_id: "sub-1" },
      "u1"
    )
    const update = calls.find((c) => c.method === "update")!
    expect(update.args[0]).not.toHaveProperty("budget_sub_item_id")
    expect((logSystem.mock.calls[0] as [{ new_value: object }])[0].new_value).not.toHaveProperty(
      "budget_sub_item_id"
    )
  })

  it("translates the trigger violation to a friendly message", async () => {
    const { db } = chainDb({
      budget_intentions: [
        { data: { status: "PENDING", users: null } },
        { error: { message: "El fondo no pertenece al ministerio de la solicitud" } }
      ]
    })
    await expect(
      intentionsService.review(
        db,
        "i1",
        { action: "APPROVED", message: "ok", fund_sub_item_id: "sub-x" },
        "u1"
      )
    ).rejects.toThrow("El fondo no pertenece al ministerio de la solicitud")
  })
})

describe("intentionsService.setFund", () => {
  beforeEach(() => logSystem.mockClear())

  it("rejects when the request already has a settlement", async () => {
    const { db } = chainDb({
      budget_intentions: [{ data: { status: "APPROVED", budget_sub_item_id: null } }],
      expense_settlements: [{ data: [{ id: "s1" }] }]
    })
    await expect(intentionsService.setFund(db, "i1", "sub-1", "u1")).rejects.toThrow(
      "No se puede cambiar el fondo: la solicitud ya tiene rendición"
    )
    expect(logSystem).not.toHaveBeenCalled()
  })

  it("rejects when the request is not approved", async () => {
    const { db } = chainDb({
      budget_intentions: [{ data: { status: "PENDING", budget_sub_item_id: null } }],
      expense_settlements: [{ data: [] }]
    })
    await expect(intentionsService.setFund(db, "i1", "sub-1", "u1")).rejects.toThrow(
      "Solo se puede asignar fondo a solicitudes aprobadas"
    )
  })

  it("updates the fund and audits previous and new value", async () => {
    const { db, calls } = chainDb({
      budget_intentions: [
        { data: { status: "APPROVED", budget_sub_item_id: "old" } },
        { data: {} }
      ],
      expense_settlements: [{ data: [] }]
    })
    await intentionsService.setFund(db, "i1", "new", "u1")
    expect(calls.find((c) => c.method === "update")!.args[0]).toMatchObject({
      budget_sub_item_id: "new"
    })
    expect(logSystem).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: "BUDGET_INTENTION",
        action: "INTENTION_FUND_CHANGED",
        previous_value: { budget_sub_item_id: "old" },
        new_value: { budget_sub_item_id: "new" }
      })
    )
  })

  it("maps the trigger violation to the friendly message", async () => {
    const { db } = chainDb({
      budget_intentions: [
        { data: { status: "APPROVED", budget_sub_item_id: null } },
        { error: { message: "El fondo no pertenece al ministerio de la solicitud" } }
      ],
      expense_settlements: [{ data: [] }]
    })
    await expect(intentionsService.setFund(db, "i1", "other", "u1")).rejects.toThrow(
      "El fondo no pertenece al ministerio de la solicitud"
    )
  })
})
