import { upsertSubItemSchema, setSubItemActiveSchema } from "../budget-sub-item"

const ID = "e2e00000-0000-0000-0000-0000000000d1"
const ID2 = "e2e00000-0000-0000-0000-0000000000d2"

describe("upsertSubItemSchema", () => {
  it("accepts a ministry budget parent", () => {
    const r = upsertSubItemSchema.safeParse({
      ministry_budget_id: ID,
      name: "Viajes",
      assigned_amount: 10
    })
    expect(r.success).toBe(true)
  })

  it("accepts a budget item parent", () => {
    const r = upsertSubItemSchema.safeParse({
      budget_item_id: ID,
      name: "Viajes",
      assigned_amount: 10
    })
    expect(r.success).toBe(true)
  })

  it("rejects both parents at once", () => {
    const r = upsertSubItemSchema.safeParse({
      ministry_budget_id: ID,
      budget_item_id: ID2,
      name: "Viajes",
      assigned_amount: 10
    })
    expect(r.success).toBe(false)
  })

  it("rejects no parent", () => {
    expect(upsertSubItemSchema.safeParse({ name: "Viajes", assigned_amount: 10 }).success).toBe(
      false
    )
  })

  it("rejects non-positive amounts and short names", () => {
    expect(
      upsertSubItemSchema.safeParse({ budget_item_id: ID, name: "Viajes", assigned_amount: 0 })
        .success
    ).toBe(false)
    expect(
      upsertSubItemSchema.safeParse({ budget_item_id: ID, name: "V", assigned_amount: 1 }).success
    ).toBe(false)
  })
})

describe("setSubItemActiveSchema", () => {
  it("requires a uuid and a boolean", () => {
    expect(setSubItemActiveSchema.safeParse({ id: ID, is_active: false }).success).toBe(true)
    expect(setSubItemActiveSchema.safeParse({ id: "x", is_active: false }).success).toBe(false)
  })
})
