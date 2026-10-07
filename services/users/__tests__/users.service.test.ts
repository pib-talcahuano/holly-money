/**
 * @jest-environment node
 */
const mockFrom = jest.fn()
const mockGenerateLink = jest.fn()
const mockLogSystem = jest.fn()

jest.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
    auth: { admin: { generateLink: (...args: unknown[]) => mockGenerateLink(...args) } }
  })
}))
jest.mock("@/services/audit/audit.service", () => ({
  auditService: { logSystem: (...args: unknown[]) => mockLogSystem(...args) }
}))
jest.mock("@/services/email/resend.service", () => ({
  sendInviteEmail: jest.fn(),
  sendResetEmail: jest.fn()
}))
jest.mock("@/services/auth/link-wrapper", () => ({ wrapAuthLink: (link: string) => link }))
jest.mock("@/services/storage/attachment-storage.service", () => ({
  attachmentStorageService: { removeMany: jest.fn() }
}))
jest.mock("@/lib/utils", () => ({ getSiteUrl: () => "http://localhost:3000" }))

import { usersService } from "../users.service"

// A thenable query-builder stub: every chained call returns itself, terminal calls resolve.
function chain(result: { data?: unknown; error?: unknown } = {}) {
  const resolved = { data: result.data ?? null, error: result.error ?? null }
  const c: Record<string, jest.Mock> & { then?: unknown } = {}
  for (const method of ["select", "eq", "update", "insert", "order", "limit"]) {
    c[method] = jest.fn(() => c)
  }
  c.single = jest.fn(async () => resolved)
  c.maybeSingle = jest.fn(async () => resolved)
  c.then = (resolve: (value: unknown) => unknown) => resolve(resolved)
  return c
}

const UPDATED = { id: "u-1", full_name: "Maria", roles: ["BURSAR", "MINISTER"], status: "ACTIVE" }

describe("usersService.update — roles", () => {
  beforeEach(() => jest.clearAllMocks())

  it("writes normalized roles", async () => {
    const current = chain({ data: { id: "u-1", roles: ["BURSAR"] } })
    const write = chain({ data: UPDATED })
    mockFrom.mockReturnValueOnce(current).mockReturnValueOnce(write)

    await usersService.update(
      { id: "u-1", full_name: "Maria", roles: ["MINISTER", "BURSAR"], status: "ACTIVE" },
      "admin-1"
    )

    expect(write.update).toHaveBeenCalledWith(
      expect.objectContaining({ roles: ["BURSAR", "MINISTER"] })
    )
  })

  it("refuses to change a DELEGATE user's roles", async () => {
    mockFrom.mockReturnValueOnce(chain({ data: { id: "u-1", roles: ["DELEGATE"] } }))

    await expect(
      usersService.update(
        { id: "u-1", full_name: "Maria", roles: ["BURSAR"], status: "ACTIVE" },
        "admin-1"
      )
    ).rejects.toThrow("El rol de un delegado no se puede modificar")
  })

  it("refuses to turn a regular user into a DELEGATE", async () => {
    mockFrom.mockReturnValueOnce(chain({ data: { id: "u-1", roles: ["BURSAR"] } }))

    await expect(
      usersService.update(
        { id: "u-1", full_name: "Maria", roles: ["DELEGATE"], status: "ACTIVE" },
        "admin-1"
      )
    ).rejects.toThrow("El rol de delegado solo se asigna desde Ministerios")
  })

  it("lets a DELEGATE user be saved with the same role", async () => {
    const current = chain({ data: { id: "u-1", roles: ["DELEGATE"] } })
    const write = chain({ data: { ...UPDATED, roles: ["DELEGATE"] } })
    mockFrom.mockReturnValueOnce(current).mockReturnValueOnce(write)

    await usersService.update(
      { id: "u-1", full_name: "Maria", roles: ["DELEGATE"], status: "INACTIVE" },
      "admin-1"
    )

    expect(write.update).toHaveBeenCalledWith(expect.objectContaining({ roles: ["DELEGATE"] }))
  })
})

describe("usersService.invite — roles", () => {
  beforeEach(() => jest.clearAllMocks())

  it("stores normalized roles on the new profile", async () => {
    const lookup = chain({ data: null })
    const insert = chain()
    const profile = chain({
      data: { id: "new-1", full_name: "Ana", roles: ["BURSAR", "MINISTER"] }
    })
    mockFrom.mockReturnValueOnce(lookup).mockReturnValueOnce(insert).mockReturnValueOnce(profile)
    mockGenerateLink.mockResolvedValue({
      data: { user: { id: "new-1" }, properties: { action_link: "http://link" } },
      error: null
    })

    await usersService.invite(
      { full_name: "Ana", email: "ana@example.com", roles: ["MINISTER", "BURSAR"] },
      "admin-1"
    )

    expect(insert.insert).toHaveBeenCalledWith(
      expect.objectContaining({ roles: ["BURSAR", "MINISTER"], status: "PENDING_ACTIVATION" })
    )
  })
})
