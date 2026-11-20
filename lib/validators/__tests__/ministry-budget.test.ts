import { createBudgetPeriodSchema } from "../ministry-budget"

describe("createBudgetPeriodSchema", () => {
  it("accepts a year in range", () => {
    expect(createBudgetPeriodSchema.safeParse({ year: 2026 }).success).toBe(true)
  })

  it.each([1999, 2101, 2026.5, "abc"])("rejects %p", (year) => {
    expect(createBudgetPeriodSchema.safeParse({ year }).success).toBe(false)
  })
})
