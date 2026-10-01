import { createUserSchema, updateUserSchema } from "../user"

const base = { full_name: "Juan Pérez", email: "juan@example.com" }

describe("createUserSchema roles", () => {
  it("accepts several roles", () => {
    expect(createUserSchema.safeParse({ ...base, roles: ["MINISTER", "BURSAR"] }).success).toBe(
      true
    )
  })

  it("requires at least one role", () => {
    expect(createUserSchema.safeParse({ ...base, roles: [] }).success).toBe(false)
  })

  it("rejects duplicates", () => {
    expect(createUserSchema.safeParse({ ...base, roles: ["BURSAR", "BURSAR"] }).success).toBe(false)
  })

  it("keeps ADMIN exclusive", () => {
    expect(createUserSchema.safeParse({ ...base, roles: ["ADMIN"] }).success).toBe(true)
    expect(createUserSchema.safeParse({ ...base, roles: ["ADMIN", "BURSAR"] }).success).toBe(false)
  })
})

describe("updateUserSchema roles", () => {
  it("applies the same rules", () => {
    const input = { id: "u-1", full_name: "Juan Pérez", status: "ACTIVE" as const }
    expect(updateUserSchema.safeParse({ ...input, roles: ["BURSAR", "MINISTER"] }).success).toBe(
      true
    )
    expect(updateUserSchema.safeParse({ ...input, roles: ["ADMIN", "FINANCE"] }).success).toBe(
      false
    )
  })
})
