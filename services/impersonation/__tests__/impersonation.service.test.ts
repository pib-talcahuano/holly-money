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

describe("impersonationService.start — target roles", () => {
  beforeEach(() => jest.clearAllMocks())

  it("refuses an ADMIN target", async () => {
    mockFrom.mockReturnValueOnce(targetRow(["ADMIN"]))
    await expect(impersonationService.start("admin-1", "t-1")).rejects.toThrow(
      "No se puede suplantar a otro administrador"
    )
  })

  it("does not refuse a bursar+minister target on role grounds", async () => {
    mockFrom.mockReturnValueOnce(targetRow(["BURSAR", "MINISTER"]))
    // The next query (existing session lookup) has no stub, so start() fails there —
    // reaching it proves the role check passed.
    await expect(impersonationService.start("admin-1", "t-1")).rejects.not.toThrow(
      "No se puede suplantar a otro administrador"
    )
  })
})
