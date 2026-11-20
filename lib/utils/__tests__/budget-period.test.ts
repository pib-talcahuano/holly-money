import { budgetPeriodRange } from "../budget-period"

describe("budgetPeriodRange", () => {
  it("runs from March 1 to the last day of February next year", () => {
    expect(budgetPeriodRange(2026)).toEqual({ start_date: "2026-03-01", end_date: "2027-02-28" })
  })

  it("ends on Feb 29 when the next year is a leap year", () => {
    expect(budgetPeriodRange(2027)).toEqual({ start_date: "2027-03-01", end_date: "2028-02-29" })
  })

  it("handles 2024 (leap start year, non-leap end)", () => {
    expect(budgetPeriodRange(2024)).toEqual({ start_date: "2024-03-01", end_date: "2025-02-28" })
  })
})
