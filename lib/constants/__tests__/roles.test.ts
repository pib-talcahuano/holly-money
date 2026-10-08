import { USER_ROLES, hasRole, hasAnyRole, rolesLabel, normalizeRoles } from "../roles"

describe("hasRole", () => {
  it("finds a role among several", () => {
    expect(hasRole({ roles: ["BURSAR", "MINISTER"] }, USER_ROLES.MINISTER)).toBe(true)
  })

  it("is false when the role is absent", () => {
    expect(hasRole({ roles: ["BURSAR"] }, USER_ROLES.MINISTER)).toBe(false)
  })

  it("is false for a missing user", () => {
    expect(hasRole(null, USER_ROLES.ADMIN)).toBe(false)
    expect(hasRole(undefined, USER_ROLES.ADMIN)).toBe(false)
  })
})

describe("hasAnyRole", () => {
  it("is true when at least one role overlaps", () => {
    expect(hasAnyRole({ roles: ["FINANCE", "MINISTER"] }, ["BURSAR", "MINISTER"])).toBe(true)
  })

  it("is false when nothing overlaps", () => {
    expect(hasAnyRole({ roles: ["FINANCE"] }, ["BURSAR", "MINISTER"])).toBe(false)
  })
})

describe("rolesLabel", () => {
  it("joins Spanish labels", () => {
    expect(rolesLabel(["BURSAR", "MINISTER"])).toBe("Tesorero · Ministro")
  })

  it("passes unknown roles through", () => {
    expect(rolesLabel(["MYSTERY"])).toBe("MYSTERY")
  })
})

describe("normalizeRoles", () => {
  it("orders by ROLE_ORDER and drops duplicates", () => {
    expect(normalizeRoles(["MINISTER", "BURSAR", "BURSAR"])).toEqual(["BURSAR", "MINISTER"])
  })
})
