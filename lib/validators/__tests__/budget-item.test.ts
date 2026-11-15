import { upsertBudgetItemSchema, setBudgetItemActiveSchema } from "../budget-item"

const PERIOD_ID = "e2e00000-0000-0000-0000-0000000000b1"
const valid = { budget_period_id: PERIOD_ID, name: "Directorio", assigned_amount: 1000 }

describe("upsertBudgetItemSchema", () => {
  it("rejects a name shorter than 2 characters", () => {
    const result = upsertBudgetItemSchema.safeParse({ ...valid, name: "a" })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0].message).toBe("El nombre debe tener al menos 2 caracteres")
  })

  it("rejects an assigned amount of 0", () => {
    const result = upsertBudgetItemSchema.safeParse({ ...valid, assigned_amount: 0 })
    expect(result.error?.issues[0].message).toBe("El monto asignado debe ser mayor a 0")
  })

  it("rejects a negative initial used amount", () => {
    const result = upsertBudgetItemSchema.safeParse({ ...valid, initial_used_amount: -1 })
    expect(result.error?.issues[0].message).toBe("El monto inicial utilizado no puede ser negativo")
  })

  it("defaults initial_used_amount to 0 and accepts a null category", () => {
    const parsed = upsertBudgetItemSchema.parse({ ...valid, category_id: null })
    expect(parsed.initial_used_amount).toBe(0)
    expect(parsed.category_id).toBeNull()
  })

  it("coerces numeric strings coming from form inputs", () => {
    expect(
      upsertBudgetItemSchema.parse({ ...valid, assigned_amount: "2500" }).assigned_amount
    ).toBe(2500)
  })
})

describe("setBudgetItemActiveSchema", () => {
  it("requires a boolean is_active", () => {
    expect(setBudgetItemActiveSchema.safeParse({ id: PERIOD_ID, is_active: "no" }).success).toBe(
      false
    )
    expect(setBudgetItemActiveSchema.safeParse({ id: PERIOD_ID, is_active: false }).success).toBe(
      true
    )
  })
})
