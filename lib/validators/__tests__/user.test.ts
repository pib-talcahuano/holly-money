import { createUserSchema, updateUserSchema } from "../user"

const base = { full_name: "Maria Perez", email: "maria@example.com" }

function messages(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues.map((i) => i.message) ?? []
}

describe("createUserSchema roles", () => {
  it("accepts a combination of roles", () => {
    expect(createUserSchema.safeParse({ ...base, roles: ["BURSAR", "MINISTER"] }).success).toBe(
      true
    )
  })

  it("accepts ADMIN on its own", () => {
    expect(createUserSchema.safeParse({ ...base, roles: ["ADMIN"] }).success).toBe(true)
  })

  it("rejects an empty list", () => {
    const result = createUserSchema.safeParse({ ...base, roles: [] })
    expect(result.success).toBe(false)
    expect(messages(result)).toContain("Selecciona al menos un rol")
  })

  it("rejects duplicates", () => {
    const result = createUserSchema.safeParse({ ...base, roles: ["BURSAR", "BURSAR"] })
    expect(result.success).toBe(false)
    expect(messages(result)).toContain("Roles duplicados")
  })

  it("rejects ADMIN combined with another role", () => {
    const result = createUserSchema.safeParse({ ...base, roles: ["ADMIN", "BURSAR"] })
    expect(result.success).toBe(false)
    expect(messages(result)).toContain("Este rol no se puede combinar con otros")
  })

  it("does not allow creating a DELEGATE here", () => {
    const result = createUserSchema.safeParse({ ...base, roles: ["DELEGATE"] })
    expect(result.success).toBe(false)
    expect(messages(result)).toContain("Rol no permitido")
  })
})

describe("updateUserSchema roles", () => {
  const update = { id: "u-1", full_name: "Maria Perez", status: "ACTIVE" as const }

  it("lets a DELEGATE user resubmit their own role", () => {
    expect(updateUserSchema.safeParse({ ...update, roles: ["DELEGATE"] }).success).toBe(true)
  })

  it("still rejects DELEGATE combined with another role", () => {
    expect(updateUserSchema.safeParse({ ...update, roles: ["DELEGATE", "BURSAR"] }).success).toBe(
      false
    )
  })

  it("rejects an empty list", () => {
    expect(updateUserSchema.safeParse({ ...update, roles: [] }).success).toBe(false)
  })
})
