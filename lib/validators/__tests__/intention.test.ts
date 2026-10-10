import { addCommentSchema } from "../intention"

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
