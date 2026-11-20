import { aggregateParentTotals } from "../budget-totals"

describe("aggregateParentTotals", () => {
  it("sums active sub-items and includes the unassigned spend", () => {
    const totals = aggregateParentTotals({
      storedAssigned: 9999,
      initialUsed: 0,
      subItems: [
        { assigned: 300, used: 120, is_active: true },
        { assigned: 200, used: 0, is_active: true }
      ],
      unassignedUsed: 50
    })
    expect(totals).toEqual({ assigned: 500, used: 170, unassigned_used: 50, remaining: 330 })
  })

  it("keeps counting the spend of a deactivated sub-item but not its assignment", () => {
    const totals = aggregateParentTotals({
      storedAssigned: 0,
      initialUsed: 0,
      subItems: [
        { assigned: 300, used: 120, is_active: true },
        { assigned: 200, used: 100, is_active: false }
      ],
      unassignedUsed: 0
    })
    expect(totals.assigned).toBe(300)
    expect(totals.used).toBe(220)
    expect(totals.remaining).toBe(80)
  })

  it("behaves as before for a parent without sub-items", () => {
    const totals = aggregateParentTotals({
      storedAssigned: 1000,
      initialUsed: 50,
      subItems: [],
      unassignedUsed: 200
    })
    expect(totals).toEqual({ assigned: 1000, used: 250, unassigned_used: 200, remaining: 750 })
  })

  it("does not clamp a negative remaining", () => {
    const totals = aggregateParentTotals({
      storedAssigned: 100,
      initialUsed: 0,
      subItems: [],
      unassignedUsed: 150
    })
    expect(totals.remaining).toBe(-50)
  })
})
