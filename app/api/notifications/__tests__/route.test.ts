/**
 * @jest-environment node
 */
const mockGetCurrentUser = jest.fn()
const mockGetMinistryForUser = jest.fn()
const mockIntentionsList = jest.fn()
const mockIntentionsPending = jest.fn()
const mockSettlementsList = jest.fn()
const mockSettlementsPending = jest.fn()
const mockMissingTransfers = jest.fn()

jest.mock("@/lib/supabase/server", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
  createSupabaseServerClient: async () => ({})
}))
jest.mock("@/services/ministries/ministries.service", () => ({
  ministriesService: { getMinistryForUser: (...a: unknown[]) => mockGetMinistryForUser(...a) }
}))
jest.mock("@/services/intentions/intentions.service", () => ({
  intentionsService: {
    list: (...a: unknown[]) => mockIntentionsList(...a),
    getPendingCount: (...a: unknown[]) => mockIntentionsPending(...a),
    getMissingTransfersCount: (...a: unknown[]) => mockMissingTransfers(...a)
  }
}))
jest.mock("@/services/settlements/settlements.service", () => ({
  settlementsService: {
    list: (...a: unknown[]) => mockSettlementsList(...a),
    getPendingCount: (...a: unknown[]) => mockSettlementsPending(...a)
  }
}))

import { GET } from "../route"

const MINISTER = ["CREATE_REQUEST", "CREATE_SETTLEMENT", "VIEW_WORKFLOW"]
const BURSAR = ["REVIEW_INTENTIONS", "VIEW_WORKFLOW", "CREATE_MOVEMENT"]

function asUser(permissions: string[]) {
  mockGetCurrentUser.mockResolvedValue({ id: "u-1", permissions: new Set(permissions) })
}

describe("GET /api/notifications", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetMinistryForUser.mockResolvedValue({ ministry_id: "m-1" })
    mockIntentionsList.mockResolvedValue([
      { id: "i-1", purpose: "Retiro", updated_at: "2026-10-01T00:00:00Z" }
    ])
    mockSettlementsList.mockResolvedValue([])
    mockIntentionsPending.mockResolvedValue(2)
    mockSettlementsPending.mockResolvedValue(1)
    mockMissingTransfers.mockResolvedValue(0)
  })

  it("gives a plain minister only their own items", async () => {
    asUser(MINISTER)
    const body = await (await GET()).json()

    expect(body.items.map((i: { type: string }) => i.type)).toEqual(["INTENTION_APPROVED"])
    expect(body.count).toBe(1)
    expect(mockIntentionsPending).not.toHaveBeenCalled()
  })

  it("gives a plain bursar only reviewer counts", async () => {
    asUser(BURSAR)
    const body = await (await GET()).json()

    expect(body.items.map((i: { type: string }) => i.type)).toEqual([
      "INTENTIONS_PENDING",
      "SETTLEMENTS_PENDING"
    ])
    expect(body.count).toBe(3)
    expect(mockGetMinistryForUser).not.toHaveBeenCalled()
  })

  it("gives a bursar+minister both sides", async () => {
    asUser([...BURSAR, ...MINISTER])
    const body = await (await GET()).json()

    expect(body.items.map((i: { type: string }) => i.type)).toEqual([
      "INTENTION_APPROVED",
      "INTENTIONS_PENDING",
      "SETTLEMENTS_PENDING"
    ])
    expect(body.count).toBe(4)
  })

  it("keeps finance on the reviewer-style counts", async () => {
    asUser(["VIEW_WORKFLOW"])
    const body = await (await GET()).json()

    expect(body.count).toBe(3)
  })

  it("returns an empty minister result when no ministry is assigned", async () => {
    asUser(MINISTER)
    mockGetMinistryForUser.mockResolvedValue(null)
    const body = await (await GET()).json()

    expect(body).toEqual({ count: 0, items: [] })
  })
})
