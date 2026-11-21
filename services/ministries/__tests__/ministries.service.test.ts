/**
 * @jest-environment node
 */
const mockLogSystem = jest.fn()
const mockRpc = jest.fn()

jest.mock("@/services/audit/audit.service", () => ({
  auditService: { logSystem: (...args: unknown[]) => mockLogSystem(...args) }
}))

jest.mock("@/services/users/users.service", () => ({ usersService: {} }))

jest.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ rpc: (...args: unknown[]) => mockRpc(...args) })
}))

import { ministriesService } from "../ministries.service"

const MINISTRY_ID = "e2e00000-0000-0000-0000-0000000000a1"
const USER_ID = "e2e00000-0000-0000-0000-0000000000u1"

// Chainable fake for the one read delete() does: ministries.select("name").eq().single()
function fakeDb(name: string | null = "Jóvenes") {
  const chain: Record<string, unknown> = {}
  for (const m of ["select", "eq"]) chain[m] = () => chain
  chain.single = () =>
    Promise.resolve(
      name === null ? { data: null, error: { message: "nf" } } : { data: { name }, error: null }
    )
  return { from: () => chain } as never
}

describe("ministriesService.delete", () => {
  beforeEach(() => jest.clearAllMocks())

  it("audits MINISTRY_DELETED with the name when the RPC deletes", async () => {
    mockRpc.mockResolvedValue({ data: { deleted: true }, error: null })
    const result = await ministriesService.delete(fakeDb(), MINISTRY_ID, USER_ID)
    expect(mockRpc).toHaveBeenCalledWith("delete_ministry_if_unused", {
      p_ministry_id: MINISTRY_ID
    })
    expect(result).toEqual({ deleted: true })
    expect(mockLogSystem).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: "MINISTRY",
        action: "MINISTRY_DELETED",
        user_id: USER_ID,
        entity_id: MINISTRY_ID,
        previous_value: { name: "Jóvenes" }
      })
    )
  })

  it("returns blockers and does not audit when the ministry has history", async () => {
    const blockers = { budget_intentions: 2 }
    mockRpc.mockResolvedValue({ data: { deleted: false, blockers }, error: null })
    const result = await ministriesService.delete(fakeDb(), MINISTRY_ID, USER_ID)
    expect(result).toEqual({ deleted: false, blockers })
    expect(mockLogSystem).not.toHaveBeenCalled()
  })

  it("throws when the RPC errors", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "boom" } })
    await expect(ministriesService.delete(fakeDb(), MINISTRY_ID, USER_ID)).rejects.toEqual({
      message: "boom"
    })
    expect(mockLogSystem).not.toHaveBeenCalled()
  })
})
