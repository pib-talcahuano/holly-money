import { upsertBudgetPeriod, upsertMinistryBudget } from "../ministry-budgets"
import { upsertBudgetPeriodSchema, upsertMinistryBudgetSchema } from "@/lib/validators/ministry-budget"

const mockGetCurrentUser = jest.fn()
const mockDb = {}
const mockCreateSupabaseServerClient = jest.fn(() => Promise.resolve(mockDb))
const mockCan = jest.fn()
const mockUpsertPeriod = jest.fn()
const mockUpsertBudget = jest.fn()
const mockRevalidatePath = jest.fn()

jest.mock("@/lib/supabase/server", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
  createSupabaseServerClient: () => mockCreateSupabaseServerClient()
}))

jest.mock("@/lib/permissions/rbac", () => ({
  PERMISSIONS: { MANAGE_BUDGETS: "MANAGE_BUDGETS" },
  can: (...args: unknown[]) => mockCan(...args)
}))

jest.mock("@/services/ministries/ministry-budget.service", () => ({
  ministryBudgetService: {
    upsertPeriod: (...args: unknown[]) => mockUpsertPeriod(...args),
    upsertBudget: (...args: unknown[]) => mockUpsertBudget(...args)
  }
}))

jest.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args)
}))

const mockUser = { id: "user-1", permissions: ["MANAGE_BUDGETS"] }

describe("upsertBudgetPeriod", () => {
  beforeEach(() => jest.clearAllMocks())

  it("throws when lacking MANAGE_BUDGETS", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(false)
    await expect(
      upsertBudgetPeriod({ label: "2026", start_date: "2026-01-01", end_date: "2026-12-31" })
    ).rejects.toThrow("Sin permisos")
  })

  it("rejects end_date before start_date before hitting the service", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(true)
    await expect(
      upsertBudgetPeriod({ label: "2026", start_date: "2026-12-31", end_date: "2026-01-01" })
    ).rejects.toThrow("posterior")
    expect(mockUpsertPeriod).not.toHaveBeenCalled()
  })

  it("creates period and revalidates /ministries", async () => {
    const created = { id: "p-1", label: "2026" }
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(true)
    mockUpsertPeriod.mockResolvedValue(created)

    const data = await upsertBudgetPeriod({
      label: "2026",
      start_date: "2026-01-01",
      end_date: "2026-12-31"
    })

    expect(mockUpsertPeriod).toHaveBeenCalledWith(
      mockDb,
      { label: "2026", start_date: "2026-01-01", end_date: "2026-12-31" },
      mockUser.id
    )
    expect(mockRevalidatePath).toHaveBeenCalledWith("/ministries")
    expect(data).toEqual(created)
  })
})

describe("upsertMinistryBudget", () => {
  beforeEach(() => jest.clearAllMocks())

  it("throws when lacking MANAGE_BUDGETS", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(false)
    await expect(
      upsertMinistryBudget({
        ministry_id: "11111111-1111-4111-8111-111111111111",
        budget_period_id: "22222222-2222-4222-8222-222222222222",
        assigned_amount: 100000,
        initial_used_amount: 0
      })
    ).rejects.toThrow("Sin permisos")
  })

  it("rejects a negative assigned_amount before hitting the service", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(true)
    await expect(
      upsertMinistryBudget({
        ministry_id: "11111111-1111-4111-8111-111111111111",
        budget_period_id: "22222222-2222-4222-8222-222222222222",
        assigned_amount: -1,
        initial_used_amount: 0
      })
    ).rejects.toThrow("mayor a 0")
    expect(mockUpsertBudget).not.toHaveBeenCalled()
  })

  it("upserts budget and revalidates ministry pages", async () => {
    const result = { id: "b-1" }
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(true)
    mockUpsertBudget.mockResolvedValue(result)

    const input = {
      ministry_id: "11111111-1111-4111-8111-111111111111",
      budget_period_id: "22222222-2222-4222-8222-222222222222",
      assigned_amount: 100000,
      initial_used_amount: 20000
    }
    const data = await upsertMinistryBudget(input)

    expect(mockUpsertBudget).toHaveBeenCalledWith(mockDb, input, mockUser.id)
    expect(mockRevalidatePath).toHaveBeenCalledWith("/ministries")
    expect(mockRevalidatePath).toHaveBeenCalledWith(
      `/ministries/${input.ministry_id}`
    )
    expect(data).toEqual(result)
  })
})

describe("upsertBudgetPeriodSchema", () => {
  it("rejects end_date <= start_date", () => {
    const result = upsertBudgetPeriodSchema.safeParse({
      label: "2026",
      start_date: "2026-06-01",
      end_date: "2026-06-01"
    })
    expect(result.success).toBe(false)
  })

  it("accepts a valid period", () => {
    const result = upsertBudgetPeriodSchema.safeParse({
      label: "2026",
      start_date: "2026-01-01",
      end_date: "2026-12-31"
    })
    expect(result.success).toBe(true)
  })
})

describe("upsertMinistryBudgetSchema", () => {
  it("rejects a negative initial_used_amount", () => {
    const result = upsertMinistryBudgetSchema.safeParse({
      ministry_id: "11111111-1111-4111-8111-111111111111",
      budget_period_id: "22222222-2222-4222-8222-222222222222",
      assigned_amount: 1000,
      initial_used_amount: -1
    })
    expect(result.success).toBe(false)
  })

  it("defaults initial_used_amount to 0", () => {
    const result = upsertMinistryBudgetSchema.safeParse({
      ministry_id: "11111111-1111-4111-8111-111111111111",
      budget_period_id: "22222222-2222-4222-8222-222222222222",
      assigned_amount: 1000
    })
    expect(result.success).toBe(true)
    expect(result.data?.initial_used_amount).toBe(0)
  })
})
