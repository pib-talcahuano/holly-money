/**
 * @jest-environment node
 */
const mockGetCurrentUser = jest.fn()
const mockGetMinistryForUser = jest.fn()
const mockList = jest.fn()

jest.mock("@/lib/supabase/server", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
  createSupabaseServerClient: async () => ({})
}))
jest.mock("@/services/ministries/ministries.service", () => ({
  ministriesService: { getMinistryForUser: (...a: unknown[]) => mockGetMinistryForUser(...a) }
}))
jest.mock("@/services/intentions/intentions.service", () => ({
  intentionsService: { list: (...a: unknown[]) => mockList(...a) }
}))

import { GET } from "../route"

const MINISTER = ["CREATE_REQUEST", "CREATE_SETTLEMENT", "VIEW_WORKFLOW"]
const BURSAR = ["REVIEW_INTENTIONS", "VIEW_WORKFLOW", "CREATE_MOVEMENT"]
const FINANCE = ["VIEW_WORKFLOW", "VIEW_DASHBOARD", "VIEW_MOVEMENT"]

function asUser(permissions: string[], roles: string[]) {
  mockGetCurrentUser.mockResolvedValue({ id: "u-1", permissions: new Set(permissions), roles })
}

function get() {
  return GET(new Request("http://localhost/api/requests"))
}

describe("GET /api/requests", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetMinistryForUser.mockResolvedValue({ ministry_id: "m-1" })
    mockList.mockResolvedValue([])
  })

  it("scopes a plain minister to their ministry", async () => {
    asUser(MINISTER, ["MINISTER"])
    await get()

    expect(mockList).toHaveBeenCalledWith({}, expect.objectContaining({ ministryId: "m-1" }))
  })

  it("does not scope a finance+minister", async () => {
    asUser([...FINANCE, ...MINISTER], ["FINANCE", "MINISTER"])
    const res = await get()

    expect(res.status).toBe(200)
    expect(mockGetMinistryForUser).not.toHaveBeenCalled()
    expect(mockList).toHaveBeenCalledWith({}, expect.objectContaining({ ministryId: undefined }))
  })

  it("does not scope a bursar+minister", async () => {
    asUser([...BURSAR, ...MINISTER], ["BURSAR", "MINISTER"])
    await get()

    expect(mockGetMinistryForUser).not.toHaveBeenCalled()
    expect(mockList).toHaveBeenCalledWith({}, expect.objectContaining({ ministryId: undefined }))
  })
})
