/**
 * @jest-environment node
 */
const mockFrom = jest.fn()

jest.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: (...args: unknown[]) => mockFrom(...args) })
}))
jest.mock("@/services/audit/audit.service", () => ({
  auditService: { logSystem: jest.fn() }
}))

import { impersonationService } from "../impersonation.service"

function targetRow(roles: string[], status = "ACTIVE") {
  const c: Record<string, jest.Mock> = {}
  c.select = jest.fn(() => c)
  c.eq = jest.fn(() => c)
  c.single = jest.fn(async () => ({
    data: { id: "t-1", full_name: "T", email: "t@example.com", roles, status },
    error: null
  }))
  return c
}

function chain(result: { data: unknown }) {
  const c: Record<string, jest.Mock> = {}
  for (const method of ["select", "eq", "is", "gt", "insert"]) {
    c[method] = jest.fn(() => c)
  }
  c.maybeSingle = jest.fn(async () => ({ data: result.data, error: null }))
  c.single = jest.fn(async () => ({ data: result.data, error: null }))
  return c
}

describe("impersonationService.start — target roles", () => {
  beforeEach(() => jest.clearAllMocks())

  it("refuses an ADMIN target", async () => {
    mockFrom.mockReturnValueOnce(targetRow(["ADMIN"]))
    await expect(impersonationService.start("admin-1", "t-1")).rejects.toThrow(
      "No se puede suplantar a otro administrador"
    )
  })

  it("starts a session for a bursar+minister target", async () => {
    const session = {
      id: "s-1",
      impersonator_id: "admin-1",
      target_user_id: "t-1",
      started_at: "2026-10-07T00:00:00Z",
      expires_at: "2026-10-07T00:30:00Z"
    }
    const noExisting = chain({ data: null })
    const insert = chain({ data: session })
    mockFrom
      .mockReturnValueOnce(targetRow(["BURSAR", "MINISTER"]))
      .mockReturnValueOnce(noExisting)
      .mockReturnValueOnce(insert)

    await expect(impersonationService.start("admin-1", "t-1")).resolves.toEqual(session)
    expect(insert.insert).toHaveBeenCalledWith(
      expect.objectContaining({ impersonator_id: "admin-1", target_user_id: "t-1" })
    )
  })
})
