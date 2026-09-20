import {
  createRequest,
  reviewRequest,
  submitRequest,
  cancelRequest,
  addComment,
  getRecentPurposes
} from "../requests"

const mockGetCurrentUser = jest.fn()
const mockDb = {}
const mockCreateSupabaseServerClient = jest.fn(() => Promise.resolve(mockDb))
const mockCan = jest.fn()
const mockGetMinistryForUser = jest.fn()
const mockCreate = jest.fn()
const mockReview = jest.fn()
const mockSubmit = jest.fn()
const mockCancel = jest.fn()
const mockRegisterTransfer = jest.fn()
const mockAddComment = jest.fn()
const mockRevalidatePath = jest.fn()
const mockGetCachedRecentPurposes = jest.fn()
const mockRevalidateRecentPurposes = jest.fn()

jest.mock("@/lib/supabase/server", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
  createSupabaseServerClient: () => mockCreateSupabaseServerClient()
}))

const mockCanAccessWorkflow = jest.fn()

jest.mock("@/lib/permissions/rbac", () => ({
  PERMISSIONS: {
    CREATE_REQUEST: "CREATE_REQUEST",
    REVIEW_INTENTIONS: "REVIEW_INTENTIONS",
    VIEW_WORKFLOW: "VIEW_WORKFLOW"
  },
  can: (...args: unknown[]) => mockCan(...args),
  canAccessWorkflow: (...args: unknown[]) => mockCanAccessWorkflow(...args)
}))

jest.mock("@/services/intentions/intentions.service", () => ({
  intentionsService: {
    create: (...args: unknown[]) => mockCreate(...args),
    review: (...args: unknown[]) => mockReview(...args),
    submit: (...args: unknown[]) => mockSubmit(...args),
    cancel: (...args: unknown[]) => mockCancel(...args),
    registerTransfer: (...args: unknown[]) => mockRegisterTransfer(...args),
    addComment: (...args: unknown[]) => mockAddComment(...args)
  },
  getCachedRecentPurposes: (...args: unknown[]) => mockGetCachedRecentPurposes(...args),
  revalidateRecentPurposes: (...args: unknown[]) => mockRevalidateRecentPurposes(...args)
}))

jest.mock("@/services/ministries/ministries.service", () => ({
  ministriesService: {
    getMinistryForUser: (...args: unknown[]) => mockGetMinistryForUser(...args)
  }
}))

jest.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args)
}))

const mockUser = {
  id: "user-1",
  permissions: ["CREATE_REQUEST", "REVIEW_INTENTIONS", "VIEW_WORKFLOW"]
}
const requestInput = {
  amount: 5000,
  purpose: "Test request long enough",
  funding_method: "TRANSFER" as const,
  isDraft: false
}

describe("createRequest", () => {
  beforeEach(() => jest.clearAllMocks())

  it("throws when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null)
    mockCan.mockReturnValue(false)
    await expect(createRequest(requestInput)).rejects.toThrow("Sin permisos")
  })

  it("throws when user has no ministry assignment", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(true)
    mockGetMinistryForUser.mockResolvedValue(null)
    await expect(createRequest(requestInput)).rejects.toThrow("No tienes un ministerio asignado")
  })

  it("creates request with ministry_id and revalidates", async () => {
    const assignment = { ministry_id: "m-1" }
    const created = { id: "req-1", ...requestInput }
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(true)
    mockGetMinistryForUser.mockResolvedValue(assignment)
    mockCreate.mockResolvedValue(created)

    const data = await createRequest(requestInput)

    expect(mockCreate).toHaveBeenCalledWith(mockDb, requestInput, mockUser.id, "m-1")
    expect(mockRevalidatePath).toHaveBeenCalledWith("/requests")
    expect(mockRevalidateRecentPurposes).toHaveBeenCalled()
    expect(data).toEqual(created)
  })
})

describe("getRecentPurposes", () => {
  beforeEach(() => jest.clearAllMocks())

  it("returns [] when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null)

    const result = await getRecentPurposes()

    expect(result).toEqual([])
    expect(mockGetCachedRecentPurposes).not.toHaveBeenCalled()
  })

  it("returns [] when lacking CREATE_REQUEST permission", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(false)

    const result = await getRecentPurposes()

    expect(result).toEqual([])
    expect(mockGetCachedRecentPurposes).not.toHaveBeenCalled()
  })

  it("delegates to the cached lookup for the current user", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(true)
    mockGetCachedRecentPurposes.mockResolvedValue(["Campamento"])

    const result = await getRecentPurposes()

    expect(mockGetCachedRecentPurposes).toHaveBeenCalledWith(mockUser.id)
    expect(result).toEqual(["Campamento"])
  })
})

describe("reviewRequest", () => {
  beforeEach(() => jest.clearAllMocks())

  it("throws when lacks REVIEW_INTENTIONS permission", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(false)
    await expect(reviewRequest("req-1", { action: "APPROVED", message: "ok" })).rejects.toThrow(
      "Sin permisos"
    )
  })

  it("returns alreadyActioned:true without revalidating", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(true)
    mockReview.mockResolvedValue({ alreadyActioned: true })

    const result = await reviewRequest("req-1", { action: "APPROVED", message: "ok" })

    expect(result).toEqual({ alreadyActioned: true })
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it("revalidates on successful review", async () => {
    const reviewResult = { alreadyActioned: false, data: { id: "req-1" } }
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(true)
    mockReview.mockResolvedValue(reviewResult)

    const result = await reviewRequest("req-1", { action: "APPROVED", message: "ok" })

    expect(result).toEqual(reviewResult)
    expect(mockRevalidatePath).toHaveBeenCalledWith("/requests/req-1")
    expect(mockRevalidatePath).toHaveBeenCalledWith("/requests")
  })
})

describe("submitRequest", () => {
  beforeEach(() => jest.clearAllMocks())

  it("throws when lacks CREATE_REQUEST permission", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(false)
    await expect(submitRequest("req-1")).rejects.toThrow("Solo los ministros")
  })

  it("returns alreadyActioned:true without revalidating", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(true)
    mockSubmit.mockResolvedValue({ alreadyActioned: true })

    const result = await submitRequest("req-1")

    expect(result).toEqual({ alreadyActioned: true })
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it("revalidates on successful submit", async () => {
    const submitResult = { alreadyActioned: false, data: { id: "req-1", status: "PENDING" } }
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(true)
    mockSubmit.mockResolvedValue(submitResult)

    const result = await submitRequest("req-1")

    expect(result).toEqual(submitResult)
    expect(mockRevalidatePath).toHaveBeenCalledWith("/requests/req-1")
    expect(mockRevalidatePath).toHaveBeenCalledWith("/requests")
  })
})

describe("cancelRequest", () => {
  beforeEach(() => jest.clearAllMocks())

  it("throws when lacks CREATE_REQUEST permission", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(false)
    await expect(cancelRequest("req-1")).rejects.toThrow("Solo los ministros")
  })

  it("cancels and revalidates", async () => {
    const cancelled = { id: "req-1", status: "CANCELLED" }
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(true)
    mockCancel.mockResolvedValue(cancelled)

    const data = await cancelRequest("req-1")

    expect(data).toEqual(cancelled)
    expect(mockRevalidatePath).toHaveBeenCalledWith("/requests/req-1")
    expect(mockRevalidatePath).toHaveBeenCalledWith("/requests")
  })
})

describe("addComment", () => {
  beforeEach(() => jest.clearAllMocks())

  it("adds comment and revalidates", async () => {
    const comment = { id: "c-1", body: "ok" }
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCanAccessWorkflow.mockReturnValue(true)
    mockAddComment.mockResolvedValue(comment)

    const data = await addComment("req-1", { message: "ok" })

    expect(mockAddComment).toHaveBeenCalledWith(
      mockDb,
      "req-1",
      "INTENTION",
      { message: "ok" },
      mockUser.id
    )
    expect(mockRevalidatePath).toHaveBeenCalledWith("/requests/req-1")
    expect(data).toEqual(comment)
  })
})
