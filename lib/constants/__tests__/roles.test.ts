import { hasAnyRole, hasRole, rolesLabel, sortRoles } from "../roles"

describe("role helpers", () => {
  it("hasRole checks membership in a roles set", () => {
    expect(hasRole(["BURSAR", "MINISTER"], "MINISTER")).toBe(true)
    expect(hasRole(["BURSAR"], "MINISTER")).toBe(false)
    expect(hasRole(undefined, "MINISTER")).toBe(false)
  })

  it("hasAnyRole matches when any wanted role is held", () => {
    expect(hasAnyRole(["BURSAR", "MINISTER"], ["MINISTER", "DELEGATE"])).toBe(true)
    expect(hasAnyRole(["FINANCE"], ["MINISTER", "DELEGATE"])).toBe(false)
  })

  it("rolesLabel joins labels of every role", () => {
    expect(rolesLabel(["BURSAR", "MINISTER"])).toBe("Tesorero + Ministro")
  })

  it("sortRoles orders by privilege and de-duplicates", () => {
    expect(sortRoles(["MINISTER", "BURSAR", "MINISTER"])).toEqual(["BURSAR", "MINISTER"])
  })
})
