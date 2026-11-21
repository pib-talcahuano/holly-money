import { addCommentSchema, reviewIntentionSchema } from "../intention"

describe("addCommentSchema", () => {
  it("accepts and trims a markdown message", () => {
    const parsed = addCommentSchema.parse({ message: "  **hola**\n\n- uno\n- dos  " })
    expect(parsed.message).toBe("**hola**\n\n- uno\n- dos")
  })

  it("rejects whitespace-only messages", () => {
    expect(addCommentSchema.safeParse({ message: "  \n " }).success).toBe(false)
  })

  it("rejects messages over 5000 characters", () => {
    expect(addCommentSchema.safeParse({ message: "a".repeat(5001) }).success).toBe(false)
    expect(addCommentSchema.safeParse({ message: "a".repeat(5000) }).success).toBe(true)
  })
})

describe("reviewIntentionSchema fund_sub_item_id", () => {
  const base = { action: "APPROVED", message: "ok" } as const

  it("is optional", () => {
    expect(reviewIntentionSchema.safeParse(base).success).toBe(true)
  })

  it("accepts a uuid", () => {
    const id = "e2e00000-0000-0000-0000-0000000000a1"
    expect(reviewIntentionSchema.parse({ ...base, fund_sub_item_id: id }).fund_sub_item_id).toBe(id)
  })

  it("rejects a non-uuid with a Spanish message", () => {
    const result = reviewIntentionSchema.safeParse({ ...base, fund_sub_item_id: "nope" })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0].message).toBe("Fondo inválido")
  })
})
