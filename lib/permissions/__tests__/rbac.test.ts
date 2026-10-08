import { PERMISSIONS, isOwnMinistryScoped, mergePermissions } from "../rbac"

const P = PERMISSIONS
const minister = [P.CREATE_REQUEST, P.CREATE_SETTLEMENT, P.VIEW_WORKFLOW]
const bursar = [P.CREATE_MOVEMENT, P.REVIEW_INTENTIONS, P.VIEW_WORKFLOW, P.MANAGE_BUDGETS]

describe("mergePermissions", () => {
  it("unions permissions across roles without duplicates", () => {
    const merged = mergePermissions([bursar, minister])
    expect(merged.has(P.REVIEW_INTENTIONS)).toBe(true)
    expect(merged.has(P.CREATE_REQUEST)).toBe(true)
    expect(merged.size).toBe(new Set([...bursar, ...minister]).size)
  })

  it("is empty for no roles", () => {
    expect(mergePermissions([]).size).toBe(0)
  })
})

const finance = [P.VIEW_DASHBOARD, P.VIEW_MOVEMENT, P.VIEW_WORKFLOW]

describe("isOwnMinistryScoped", () => {
  it("is true for a plain minister", () => {
    expect(isOwnMinistryScoped({ permissions: new Set(minister), roles: ["MINISTER"] })).toBe(true)
  })

  it("is true for a delegate-only user", () => {
    expect(isOwnMinistryScoped({ permissions: new Set(minister), roles: ["DELEGATE"] })).toBe(true)
  })

  it("is false for a bursar+minister (keeps the reviewer view)", () => {
    expect(
      isOwnMinistryScoped({
        permissions: mergePermissions([bursar, minister]),
        roles: ["BURSAR", "MINISTER"]
      })
    ).toBe(false)
  })

  it("is false for finance (read-only workflow, not minister-scoped)", () => {
    expect(
      isOwnMinistryScoped({ permissions: new Set([P.VIEW_WORKFLOW]), roles: ["FINANCE"] })
    ).toBe(false)
  })

  it("is false for finance+minister (keeps finance's org-wide read view)", () => {
    expect(
      isOwnMinistryScoped({
        permissions: mergePermissions([finance, minister]),
        roles: ["FINANCE", "MINISTER"]
      })
    ).toBe(false)
  })

  it("is false when a BURSAR role is held even if the matrix dropped REVIEW_INTENTIONS", () => {
    expect(
      isOwnMinistryScoped({ permissions: new Set(minister), roles: ["BURSAR", "MINISTER"] })
    ).toBe(false)
  })

  it("is false for no user", () => {
    expect(isOwnMinistryScoped(undefined)).toBe(false)
    expect(isOwnMinistryScoped(null)).toBe(false)
  })
})
