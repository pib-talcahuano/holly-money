import {
  createMovement,
  updateMovement,
  cancelMovement,
  regeneratePdf,
  searchMovements,
  suggestDeliveredBy
} from "../movements"

const mockGetCurrentUser = jest.fn()
const mockDb = {}
const mockCreateSupabaseServerClient = jest.fn(() => Promise.resolve(mockDb))
const mockCan = jest.fn()
const mockCreate = jest.fn()
const mockUpdate = jest.fn()
const mockCancel = jest.fn()
const mockList = jest.fn()
const mockSuggestDeliveredBy = jest.fn()
const mockProcessIntegrations = jest.fn()
const mockRevalidatePath = jest.fn()
const mockSendVoucherEmail = jest.fn()
const mockSettingsGetAll = jest.fn()

jest.mock("@/lib/supabase/server", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
  createSupabaseServerClient: () => mockCreateSupabaseServerClient()
}))

jest.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({})
}))

jest.mock("@/services/vouchers/voucher.service", () => ({
  sendVoucherEmail: (...args: unknown[]) => mockSendVoucherEmail(...args)
}))

jest.mock("@/services/settings/settings.service", () => ({
  settingsService: { getAll: (...args: unknown[]) => mockSettingsGetAll(...args) }
}))

jest.mock("@/lib/permissions/rbac", () => ({
  PERMISSIONS: { CREATE_MOVEMENT: "CREATE_MOVEMENT", VIEW_MOVEMENT: "VIEW_MOVEMENT" },
  can: (...args: unknown[]) => mockCan(...args)
}))

jest.mock("@/services/movements/movements.service", () => ({
  movementsService: {
    create: (...args: unknown[]) => mockCreate(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    cancel: (...args: unknown[]) => mockCancel(...args),
    list: (...args: unknown[]) => mockList(...args),
    suggestDeliveredBy: (...args: unknown[]) => mockSuggestDeliveredBy(...args)
  }
}))

jest.mock("@/services/google/movement-postprocess", () => ({
  processMovementIntegrations: (...args: unknown[]) => mockProcessIntegrations(...args)
}))

jest.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args)
}))

jest.mock("next/server", () => ({
  after: (cb: () => Promise<void> | void) => {
    void Promise.resolve().then(cb)
  }
}))

const mockUser = { id: "user-1", permissions: ["CREATE_MOVEMENT"] }
const movementInput = {
  movement_type: "EXPENSE" as const,
  movement_date: "2026-05-01",
  amount: 10000,
  category_id: "22222222-2222-2222-2222-222222222222",
  subcategory_id: null,
  delivered_by: null,
  receipt_email: null,
  payment_method_id: null,
  notes: null,
  notify_by_email: true,
  attachments: []
}

describe("createMovement", () => {
  beforeEach(() => jest.clearAllMocks())

  it("throws when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null)
    mockCan.mockReturnValue(false)
    await expect(createMovement(movementInput)).rejects.toThrow("Sin permisos")
  })

  it("creates movement, fires integrations, revalidates", async () => {
    const created = { id: "mv-1", ...movementInput }
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(true)
    mockCreate.mockResolvedValue(created)
    mockProcessIntegrations.mockResolvedValue(undefined)

    const data = await createMovement(movementInput)

    expect(mockCreate).toHaveBeenCalledWith(mockDb, movementInput, mockUser.id)
    expect(mockRevalidatePath).toHaveBeenCalledWith("/movements")
    expect(data).toEqual(created)
  })

  it("sends the receipt confirmation email once for INCOME movements with a receipt_email", async () => {
    const created = {
      id: "mv-1",
      ...movementInput,
      movement_type: "INCOME" as const,
      receipt_email: "donante@example.com"
    }
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(true)
    mockCreate.mockResolvedValue(created)
    mockProcessIntegrations.mockResolvedValue(undefined)
    mockSettingsGetAll.mockResolvedValue({ notifications_bcc_email: "auditoria@example.com" })
    mockSendVoucherEmail.mockResolvedValue({ ok: true, mailSent: true })

    await createMovement(movementInput)
    await Promise.resolve()
    await Promise.resolve()

    expect(mockSendVoucherEmail).toHaveBeenCalledWith("mv-1", "donante@example.com", {
      bcc: "auditoria@example.com"
    })
  })

  it("does not send the receipt confirmation email for EXPENSE movements", async () => {
    const created = { id: "mv-1", ...movementInput, movement_type: "EXPENSE" as const }
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(true)
    mockCreate.mockResolvedValue(created)
    mockProcessIntegrations.mockResolvedValue(undefined)

    await createMovement(movementInput)
    await Promise.resolve()
    await Promise.resolve()

    expect(mockSendVoucherEmail).not.toHaveBeenCalled()
  })

  it("does not send the receipt confirmation email when receipt_email is missing", async () => {
    const created = {
      id: "mv-1",
      ...movementInput,
      movement_type: "INCOME" as const,
      receipt_email: null
    }
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(true)
    mockCreate.mockResolvedValue(created)
    mockProcessIntegrations.mockResolvedValue(undefined)

    await createMovement(movementInput)
    await Promise.resolve()
    await Promise.resolve()

    expect(mockSendVoucherEmail).not.toHaveBeenCalled()
  })

  it("does not fire the internal notification when notify_by_email is false", async () => {
    const created = { id: "mv-1", ...movementInput, notify_by_email: false }
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(true)
    mockCreate.mockResolvedValue(created)

    await createMovement({ ...movementInput, notify_by_email: false })

    expect(mockProcessIntegrations).not.toHaveBeenCalled()
  })
})

describe("updateMovement", () => {
  beforeEach(() => jest.clearAllMocks())

  it("throws when lacks permission", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(false)
    await expect(updateMovement("mv-1", movementInput)).rejects.toThrow("Sin permisos")
  })

  it("updates movement with id merged, revalidates both paths", async () => {
    const updated = { id: "mv-1", ...movementInput }
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(true)
    mockUpdate.mockResolvedValue(updated)
    mockProcessIntegrations.mockResolvedValue(undefined)

    const data = await updateMovement("mv-1", movementInput)

    expect(mockUpdate).toHaveBeenCalledWith(
      mockDb,
      "mv-1",
      { ...movementInput, id: "mv-1" },
      mockUser.id
    )
    expect(mockRevalidatePath).toHaveBeenCalledWith("/movements/mv-1")
    expect(mockRevalidatePath).toHaveBeenCalledWith("/movements")
    expect(data).toEqual(updated)
  })

  it("does not fire the internal notification when notify_by_email is false", async () => {
    const updated = { id: "mv-1", ...movementInput, notify_by_email: false }
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(true)
    mockUpdate.mockResolvedValue(updated)

    await updateMovement("mv-1", { ...movementInput, notify_by_email: false })

    expect(mockProcessIntegrations).not.toHaveBeenCalled()
  })
})

describe("cancelMovement", () => {
  beforeEach(() => jest.clearAllMocks())

  it("cancels movement and revalidates", async () => {
    const cancelled = { id: "mv-1", status: "CANCELLED" }
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(true)
    mockCancel.mockResolvedValue(cancelled)
    mockProcessIntegrations.mockResolvedValue(undefined)

    const data = await cancelMovement("mv-1", { cancellation_reason: "Test" })

    expect(mockCancel).toHaveBeenCalledWith(
      mockDb,
      "mv-1",
      { cancellation_reason: "Test" },
      mockUser.id
    )
    expect(mockRevalidatePath).toHaveBeenCalledWith("/movements/mv-1")
    expect(data).toEqual(cancelled)
  })
})

describe("regeneratePdf", () => {
  beforeEach(() => jest.clearAllMocks())

  it("throws when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null)
    mockCan.mockReturnValue(false)
    await expect(regeneratePdf("mv-1")).rejects.toThrow("Sin permisos")
  })

  it("fires integrations and revalidates", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(true)
    mockProcessIntegrations.mockResolvedValue(undefined)

    await regeneratePdf("mv-1")

    expect(mockProcessIntegrations).toHaveBeenCalledWith("mv-1", mockUser.id)
    expect(mockRevalidatePath).toHaveBeenCalledWith("/movements/mv-1")
  })
})

describe("searchMovements", () => {
  beforeEach(() => jest.clearAllMocks())

  it("throws when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null)
    await expect(searchMovements("mabel")).rejects.toThrow("Sin permisos para ver movimientos")
    expect(mockList).not.toHaveBeenCalled()
  })

  it("throws when the user lacks VIEW_MOVEMENT", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(false)
    await expect(searchMovements("mabel")).rejects.toThrow("Sin permisos para ver movimientos")
    expect(mockCan).toHaveBeenCalledWith(mockUser.permissions, "VIEW_MOVEMENT")
    expect(mockList).not.toHaveBeenCalled()
  })

  it("returns [] for queries shorter than 2 characters", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(true)
    await expect(searchMovements("a")).resolves.toEqual([])
    expect(mockList).not.toHaveBeenCalled()
  })

  it("trims the query and calls the service", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(true)
    mockList.mockResolvedValue({ data: [], count: 0, page: 1, pageSize: 20 })
    await searchMovements("  mabel ")
    expect(mockList).toHaveBeenCalledWith(mockDb, { search: "mabel", status: "ALL", pageSize: 20 })
  })

  it("flattens the category name and omits extra fields", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(true)
    mockList.mockResolvedValue({
      data: [
        {
          id: "mv-1",
          movement_date: "2026-05-01",
          movement_type: "INCOME",
          amount: 5000,
          status: "ACTIVE",
          delivered_by: "Mabel",
          created_by_id: "user-9",
          users: { full_name: "X" },
          movement_categories: { name: "Diezmos" }
        },
        {
          id: "mv-2",
          movement_date: "2026-05-02",
          movement_type: "EXPENSE",
          amount: 100,
          status: "CANCELLED",
          delivered_by: null,
          movement_categories: null
        }
      ],
      count: 2,
      page: 1,
      pageSize: 20
    })
    const result = await searchMovements("mabel")
    expect(result).toEqual([
      {
        id: "mv-1",
        movement_date: "2026-05-01",
        movement_type: "INCOME",
        amount: 5000,
        status: "ACTIVE",
        category_name: "Diezmos",
        delivered_by: "Mabel"
      },
      {
        id: "mv-2",
        movement_date: "2026-05-02",
        movement_type: "EXPENSE",
        amount: 100,
        status: "CANCELLED",
        category_name: null,
        delivered_by: null
      }
    ])
  })
})

describe("suggestDeliveredBy", () => {
  beforeEach(() => jest.clearAllMocks())

  it("throws when unauthenticated", async () => {
    mockGetCurrentUser.mockResolvedValue(null)
    await expect(suggestDeliveredBy("mabel", "INCOME")).rejects.toThrow(
      "Sin permisos para crear movimientos"
    )
    expect(mockSuggestDeliveredBy).not.toHaveBeenCalled()
  })

  it("throws when the user lacks CREATE_MOVEMENT", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(false)
    await expect(suggestDeliveredBy("mabel", "INCOME")).rejects.toThrow(
      "Sin permisos para crear movimientos"
    )
    expect(mockCan).toHaveBeenCalledWith(mockUser.permissions, "CREATE_MOVEMENT")
    expect(mockSuggestDeliveredBy).not.toHaveBeenCalled()
  })

  it("returns [] for queries shorter than 2 characters", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(true)
    await expect(suggestDeliveredBy("a", "INCOME")).resolves.toEqual([])
    expect(mockSuggestDeliveredBy).not.toHaveBeenCalled()
  })

  it("trims the query, calls the service and returns its result", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(true)
    const suggestions = [{ name: "Mabel Pérez", count: 3 }]
    mockSuggestDeliveredBy.mockResolvedValue(suggestions)
    await expect(suggestDeliveredBy("  mabel ", "INCOME")).resolves.toEqual(suggestions)
    expect(mockSuggestDeliveredBy).toHaveBeenCalledWith(mockDb, {
      query: "mabel",
      movementType: "INCOME"
    })
  })

  it("returns [] for an invalid movement type", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(true)
    await expect(suggestDeliveredBy("mabel", "OTHER" as never)).resolves.toEqual([])
    expect(mockSuggestDeliveredBy).not.toHaveBeenCalled()
  })
})
