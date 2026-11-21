import { getLateRegistrationDays, LATE_REGISTRATION_DAYS } from "../late-registration"

describe("getLateRegistrationDays", () => {
  it("exposes the threshold", () => {
    expect(LATE_REGISTRATION_DAYS).toBe(30)
  })

  it("returns null for exactly 30 days", () => {
    expect(getLateRegistrationDays("2026-10-01", "2026-10-31T15:00:00Z")).toBeNull()
  })

  it("returns 31 for 31 days", () => {
    expect(getLateRegistrationDays("2026-10-01", "2026-11-01T15:00:00Z")).toBe(31)
  })

  it("returns 45 for 45 days", () => {
    expect(getLateRegistrationDays("2026-10-01", "2026-11-15T15:00:00Z")).toBe(45)
  })

  it("uses the Santiago calendar day, not UTC", () => {
    expect(getLateRegistrationDays("2026-10-31", "2026-12-01T02:30:00Z")).toBeNull()
  })

  it("is not affected by daylight saving changes", () => {
    expect(getLateRegistrationDays("2026-08-20", "2026-09-21T12:00:00Z")).toBe(32)
  })

  it("returns null on the same day", () => {
    expect(getLateRegistrationDays("2026-12-01", "2026-12-01T12:00:00Z")).toBeNull()
  })

  it("returns null when the movement date is in the future", () => {
    expect(getLateRegistrationDays("2026-12-10", "2026-12-01T12:00:00Z")).toBeNull()
  })

  it("returns null for invalid input without throwing", () => {
    expect(getLateRegistrationDays("bad", "2026-12-01T12:00:00Z")).toBeNull()
    expect(getLateRegistrationDays("2026-10-01", "not-a-date")).toBeNull()
    expect(getLateRegistrationDays("", "")).toBeNull()
  })
})
