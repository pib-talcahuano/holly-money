import { createBudgetPeriodSchema, upsertMinistryBudgetSchema } from "../ministry-budget"

describe("createBudgetPeriodSchema", () => {
  it("accepts a year in range", () => {
    expect(createBudgetPeriodSchema.safeParse({ year: 2026 }).success).toBe(true)
  })

  it.each([1999, 2101, 2026.5, "abc"])("rejects %p", (year) => {
    expect(createBudgetPeriodSchema.safeParse({ year }).success).toBe(false)
  })
})

describe("upsertMinistryBudgetSchema", () => {
  const base = {
    ministry_id: "e2e00000-0000-0000-0000-0000000000a1",
    budget_period_id: "e2e00000-0000-0000-0000-0000000000b1"
  }

  it("accepts an assigned amount of 0 (a ministry that will hold sub-items)", () => {
    expect(upsertMinistryBudgetSchema.parse({ ...base, assigned_amount: 0 }).assigned_amount).toBe(
      0
    )
  })

  it("rejects a negative assigned amount", () => {
    const result = upsertMinistryBudgetSchema.safeParse({ ...base, assigned_amount: -1 })
    expect(result.error?.issues[0].message).toBe("El monto asignado no puede ser negativo")
  })
})
