import { groupDeliveredByNames, normalizeTargetName } from "../people"
import type { DeliveredByRow } from "@/types/people"

const row = (
  delivered_by: string | null,
  amount = 1000,
  movement_date = "2026-11-01",
  status: "ACTIVE" | "CANCELLED" = "ACTIVE"
): DeliveredByRow => ({ delivered_by, amount, movement_date, status })

describe("groupDeliveredByNames", () => {
  it("counts cancelled rows but only totals active ones", () => {
    const result = groupDeliveredByNames([
      row("Hna. Mabel", 20000, "2026-11-12"),
      row("Hna. Mabel", 20000, "2026-10-03"),
      row("Hna. Mabel", 7000, "2026-09-01", "CANCELLED")
    ])
    expect(result).toEqual([
      { name: "Hna. Mabel", count: 3, total: 40000, lastDate: "2026-11-12", sameAs: [] }
    ])
  })

  it("keeps exact spellings apart and links same normalized names via sameAs", () => {
    const result = groupDeliveredByNames([row("Hna. Mabel"), row("hna.  mabel"), row("Mabel")])
    const byName = Object.fromEntries(result.map((p) => [p.name, p]))
    expect(result).toHaveLength(3)
    expect(byName["Hna. Mabel"].sameAs).toEqual(["hna.  mabel"])
    expect(byName["hna.  mabel"].sameAs).toEqual(["Hna. Mabel"])
    expect(byName["Mabel"].sameAs).toEqual([])
  })

  it("orders by count desc then name with es locale", () => {
    const result = groupDeliveredByNames([row("Zoe"), row("Ana"), row("Beto"), row("Beto")])
    expect(result.map((p) => p.name)).toEqual(["Beto", "Ana", "Zoe"])
  })

  it("ignores null, empty and whitespace names", () => {
    expect(groupDeliveredByNames([row(null), row(""), row("   ")])).toEqual([])
    expect(groupDeliveredByNames([])).toEqual([])
  })

  it("preserves special characters", () => {
    const names = ["A, B", "C (D)", 'E "F"', "10%", "G\\H"]
    const result = groupDeliveredByNames(names.map((n) => row(n)))
    expect(result.map((p) => p.name).sort()).toEqual([...names].sort())
  })
})

describe("normalizeTargetName", () => {
  it("trims and collapses whitespace", () => {
    expect(normalizeTargetName("  Hna.   Mabel ")).toBe("Hna. Mabel")
    expect(normalizeTargetName("   ")).toBe("")
  })

  it("keeps case and accents", () => {
    expect(normalizeTargetName("Pérez  Ñandú")).toBe("Pérez Ñandú")
  })
})
