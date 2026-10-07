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

describe("isOwnMinistryScoped", () => {
  it("is true for a plain minister", () => {
    expect(isOwnMinistryScoped(new Set(minister))).toBe(true)
  })

  it("is false for a bursar+minister (keeps the reviewer view)", () => {
    expect(isOwnMinistryScoped(mergePermissions([bursar, minister]))).toBe(false)
  })

  it("is false for finance (read-only workflow, not minister-scoped)", () => {
    expect(isOwnMinistryScoped(new Set([P.VIEW_WORKFLOW]))).toBe(false)
  })

  it("is false for no permissions", () => {
    expect(isOwnMinistryScoped(undefined)).toBe(false)
  })
})
