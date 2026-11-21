import { formatDeleteBlockers } from "../delete-blockers"

describe("formatDeleteBlockers", () => {
  it("maps known table names to Spanish labels", () => {
    expect(
      formatDeleteBlockers({
        budget_intentions: 3,
        ministry_assignments: 1,
        ministry_delegates: 2,
        ministry_budgets: 1
      })
    ).toBe("solicitudes: 3, asignaciones de encargado: 1, delegados: 2, presupuestos: 1")
  })

  it("shows unknown keys as-is", () => {
    expect(formatDeleteBlockers({ something_else: 4 })).toBe("something_else: 4")
  })

  it("handles empty or missing blockers", () => {
    expect(formatDeleteBlockers({})).toBe("")
    expect(formatDeleteBlockers(null)).toBe("")
  })
})
