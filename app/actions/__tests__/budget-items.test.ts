import { upsertBudgetItem, setBudgetItemActive } from "../budget-items"

const mockGetCurrentUser = jest.fn()
const mockDb = {}
const mockCan = jest.fn()
const mockUpsertItem = jest.fn()
const mockSetActive = jest.fn()
const mockRevalidatePath = jest.fn()

jest.mock("@/lib/supabase/server", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
  createSupabaseServerClient: () => Promise.resolve(mockDb)
}))

jest.mock("@/lib/permissions/rbac", () => ({
  PERMISSIONS: { MANAGE_BUDGETS: "MANAGE_BUDGETS" },
  can: (...args: unknown[]) => mockCan(...args)
}))

jest.mock("@/services/ministries/budget-items.service", () => ({
  budgetItemsService: {
    upsertItem: (...args: unknown[]) => mockUpsertItem(...args),
    setActive: (...args: unknown[]) => mockSetActive(...args)
  }
}))

jest.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args)
}))

const mockUser = { id: "user-1", permissions: ["MANAGE_BUDGETS"] }
const PERIOD_ID = "22222222-2222-4222-8222-222222222222"
const ITEM_ID = "33333333-3333-4333-8333-333333333333"
const validItem = {
  budget_period_id: PERIOD_ID,
  name: "Directorio",
  assigned_amount: 100000,
  initial_used_amount: 0
}

describe("upsertBudgetItem", () => {
  beforeEach(() => jest.clearAllMocks())

  it("throws when lacking MANAGE_BUDGETS", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(false)
    await expect(upsertBudgetItem(validItem)).rejects.toThrow(
      "Sin permisos para gestionar presupuestos"
    )
    expect(mockUpsertItem).not.toHaveBeenCalled()
  })

  it("rejects invalid input with the first Zod message before hitting the service", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(true)
    await expect(upsertBudgetItem({ ...validItem, name: "a" })).rejects.toThrow(
      "El nombre debe tener al menos 2 caracteres"
    )
    expect(mockUpsertItem).not.toHaveBeenCalled()
  })

  it("calls the service with (db, parsed, user.id) and revalidates /budgets", async () => {
    const created = { id: ITEM_ID }
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(true)
    mockUpsertItem.mockResolvedValue(created)

    const data = await upsertBudgetItem(validItem)

    expect(mockUpsertItem).toHaveBeenCalledWith(mockDb, validItem, mockUser.id)
    expect(mockRevalidatePath).toHaveBeenCalledWith("/budgets")
    expect(data).toEqual(created)
  })
})

describe("setBudgetItemActive", () => {
  beforeEach(() => jest.clearAllMocks())

  it("throws when lacking MANAGE_BUDGETS", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(false)
    await expect(setBudgetItemActive({ id: ITEM_ID, is_active: false })).rejects.toThrow(
      "Sin permisos"
    )
  })

  it("calls the service and revalidates /budgets", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(true)
    mockSetActive.mockResolvedValue({ id: ITEM_ID })

    await setBudgetItemActive({ id: ITEM_ID, is_active: false })

    expect(mockSetActive).toHaveBeenCalledWith(
      mockDb,
      { id: ITEM_ID, is_active: false },
      mockUser.id
    )
    expect(mockRevalidatePath).toHaveBeenCalledWith("/budgets")
  })
})
