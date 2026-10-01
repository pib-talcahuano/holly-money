import { PERMISSIONS, isMinisterScoped } from "../rbac"

const set = (...p: string[]) => new Set(p)

describe("isMinisterScoped", () => {
  it("scopes a plain minister to their own ministry", () => {
    expect(isMinisterScoped(set(PERMISSIONS.CREATE_REQUEST, PERMISSIONS.CREATE_SETTLEMENT))).toBe(
      true
    )
  })

  it("does not scope a minister who is also a reviewer (e.g. MINISTER + BURSAR)", () => {
    expect(
      isMinisterScoped(
        set(
          PERMISSIONS.CREATE_REQUEST,
          PERMISSIONS.CREATE_SETTLEMENT,
          PERMISSIONS.REVIEW_INTENTIONS
        )
      )
    ).toBe(false)
  })

  it("does not scope users who can't create requests at all", () => {
    expect(isMinisterScoped(set(PERMISSIONS.VIEW_WORKFLOW))).toBe(false)
    expect(isMinisterScoped(undefined)).toBe(false)
  })
})
