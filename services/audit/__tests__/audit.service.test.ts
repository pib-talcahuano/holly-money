import { auditService } from "../audit.service"

const insert = jest.fn<Promise<{ error: unknown }>, [Record<string, unknown>[]]>()
const from = jest.fn((table: string) => {
  void table
  return { insert }
})
const getCurrentUser = jest.fn()

jest.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: (table: string) => from(table) })
}))
jest.mock("@/lib/supabase/server", () => ({
  getCurrentUser: () => getCurrentUser()
}))

function entries(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    movement_id: `m${i}`,
    action: "Nombre actualizado",
    user_id: "u1",
    previous_value: { delivered_by: "a" },
    new_value: { delivered_by: "b" },
    note: "n"
  }))
}

describe("auditService.logMovementsBulk", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    insert.mockResolvedValue({ error: null })
    getCurrentUser.mockResolvedValue({ impersonatorId: "imp-1" })
  })

  it("inserts one row per entry with the impersonator resolved once", async () => {
    await auditService.logMovementsBulk(entries(2))
    expect(getCurrentUser).toHaveBeenCalledTimes(1)
    expect(from).toHaveBeenCalledWith("movement_audit_log")
    expect(insert).toHaveBeenCalledTimes(1)
    expect(insert.mock.calls[0][0]).toEqual([
      {
        movement_id: "m0",
        action: "Nombre actualizado",
        user_id: "u1",
        impersonator_id: "imp-1",
        previous_value: { delivered_by: "a" },
        new_value: { delivered_by: "b" },
        note: "n"
      },
      expect.objectContaining({ movement_id: "m1", impersonator_id: "imp-1" })
    ])
  })

  it("uses the explicit impersonator_id over the session one", async () => {
    await auditService.logMovementsBulk([
      { ...entries(1)[0], impersonator_id: null },
      { ...entries(1)[0], movement_id: "m9", impersonator_id: "imp-2" },
      { ...entries(1)[0], movement_id: "m10" }
    ])
    const rows = insert.mock.calls[0][0]
    expect(rows.map((r) => r.impersonator_id)).toEqual([null, "imp-2", "imp-1"])
  })

  it("splits 1200 entries into inserts of 500, 500 and 200", async () => {
    await auditService.logMovementsBulk(entries(1200))
    expect(insert.mock.calls.map((c) => c[0].length)).toEqual([500, 500, 200])
    expect(getCurrentUser).toHaveBeenCalledTimes(1)
  })

  it("does not query for an empty list", async () => {
    await auditService.logMovementsBulk([])
    expect(from).not.toHaveBeenCalled()
    expect(getCurrentUser).not.toHaveBeenCalled()
  })

  it("throws the database error", async () => {
    const boom = new Error("insert boom")
    insert.mockResolvedValue({ error: boom })
    await expect(auditService.logMovementsBulk(entries(1))).rejects.toBe(boom)
  })
})
