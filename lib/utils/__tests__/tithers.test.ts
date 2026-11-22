import {
  currentYearInSantiago,
  groupTithers,
  parseTithersYear,
  sparklinePoints,
  titherMovementsHref,
  titherTotals,
  titherYearOptions
} from "../tithers"

const row = (delivered_by: string | null, amount: number, movement_date: string) => ({
  delivered_by,
  amount,
  movement_date
})

describe("groupTithers", () => {
  it("groups by normalized name with monthly breakdown", () => {
    const result = groupTithers([
      row("Hna. Mabel", 20000, "2026-11-12"),
      row("hna.  mabel", 20000, "2026-10-03"),
      row("Juan Pérez", 15000, "2026-01-05")
    ])
    expect(result).toHaveLength(2)
    const [mabel, juan] = result
    expect(mabel.name).toBe("Hna. Mabel")
    expect(mabel.count).toBe(2)
    expect(mabel.total).toBe(40000)
    expect(mabel.lastDate).toBe("2026-11-12")
    expect(mabel.monthlyTotals).toHaveLength(12)
    expect(mabel.monthlyCounts).toHaveLength(12)
    expect(mabel.monthlyTotals[9]).toBe(20000)
    expect(mabel.monthlyTotals[10]).toBe(20000)
    expect(mabel.monthlyCounts[10]).toBe(1)
    expect(mabel.monthlyTotals.filter((v) => v === 0)).toHaveLength(10)
    expect(juan.name).toBe("Juan Pérez")
    expect(juan.monthlyTotals[0]).toBe(15000)
  })

  it("uses the most used spelling, first seen on ties", () => {
    const result = groupTithers([
      row("ana", 1, "2026-03-01"),
      row("Ana", 1, "2026-02-01"),
      row("Ana", 1, "2026-01-01")
    ])
    expect(result[0].name).toBe("Ana")
    const tie = groupTithers([row("ana", 1, "2026-03-01"), row("Ana", 1, "2026-02-01")])
    expect(tie[0].name).toBe("ana")
  })

  it("sorts by total desc, then name, with unnamed always last", () => {
    const result = groupTithers([
      row(null, 99999, "2026-01-01"),
      row("   ", 1, "2026-01-02"),
      row("", 1, "2026-01-03"),
      row("Beto", 100, "2026-01-04"),
      row("Álvaro", 100, "2026-01-05"),
      row("Zoe", 500, "2026-01-06")
    ])
    expect(result.map((t) => t.name)).toEqual(["Zoe", "Álvaro", "Beto", "Sin nombre"])
    const unnamed = result[3]
    expect(unnamed).toMatchObject({ key: "", unnamed: true, count: 3, total: 100001 })
  })

  it("assigns boundary dates without timezone conversion", () => {
    const result = groupTithers([row("A", 5, "2027-01-01"), row("A", 7, "2026-12-31")])
    expect(result[0].monthlyTotals[11]).toBe(7)
    expect(result[0].monthlyTotals[0]).toBe(5)
  })

  it("sums decimals without visible rounding errors", () => {
    expect(
      groupTithers([row("A", 10.5, "2026-01-01"), row("A", 20.25, "2026-01-02")])[0].total
    ).toBe(30.75)
  })

  it("returns [] for no rows", () => {
    expect(groupTithers([])).toEqual([])
  })
})

describe("titherTotals", () => {
  it("sums everything and counts named tithers", () => {
    const tithers = groupTithers([
      row("A", 100, "2026-01-01"),
      row("A", 50, "2026-02-01"),
      row("B", 10, "2026-01-01"),
      ...Array.from({ length: 6 }, () => row(null, 7000, "2026-03-01"))
    ])
    expect(titherTotals(tithers)).toEqual({ total: 42160, count: 9, titherCount: 2 })
  })

  it("returns zeros for an empty list", () => {
    expect(titherTotals([])).toEqual({ total: 0, count: 0, titherCount: 0 })
  })
})

describe("sparklinePoints", () => {
  it("scales values into the padded box", () => {
    expect(sparklinePoints([0, 10], 96, 24)).toBe("4,22 92,2")
  })

  it("draws a flat baseline for all zeros", () => {
    const points = sparklinePoints([0, 0, 0], 96, 24).split(" ")
    expect(points).toHaveLength(3)
    points.forEach((p) => expect(p.split(",")[1]).toBe("22"))
  })

  it("centers a single value", () => {
    const points = sparklinePoints([5], 96, 24).split(" ")
    expect(points).toHaveLength(1)
    expect(points[0].split(",")[0]).toBe("48")
  })

  it("returns an empty string for no values", () => {
    expect(sparklinePoints([])).toBe("")
  })
})

describe("titherMovementsHref", () => {
  it("builds the income search link", () => {
    expect(titherMovementsHref("Hna. Mabel")).toBe(
      "/movements?search=Hna.%20Mabel&movement_type=INCOME"
    )
  })

  it("encodes reserved characters", () => {
    const href = titherMovementsHref("A&B #1")
    expect(href).toContain("A%26B%20%231")
  })
})

describe("currentYearInSantiago", () => {
  it("uses the Santiago calendar year", () => {
    expect(currentYearInSantiago(new Date("2026-12-31T23:30:00-03:00"))).toBe(2026)
    expect(currentYearInSantiago(new Date("2027-01-01T02:30:00Z"))).toBe(2026)
    expect(currentYearInSantiago(new Date("2027-01-01T04:00:00Z"))).toBe(2027)
  })
})

describe("parseTithersYear", () => {
  it("accepts integers between 2000 and the current year", () => {
    expect(parseTithersYear("2025", 2026)).toBe(2025)
  })

  it.each([undefined, "abc", "1999", "2099", "20.5"])("falls back for %s", (value) => {
    expect(parseTithersYear(value, 2026)).toBe(2026)
  })
})

describe("titherYearOptions", () => {
  it("lists years backwards from the current one", () => {
    expect(titherYearOptions(2026)).toEqual([2026, 2025, 2024, 2023, 2022])
    expect(titherYearOptions(2026, 2)).toEqual([2026, 2025])
  })
})
