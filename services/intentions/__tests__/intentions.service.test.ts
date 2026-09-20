import { intentionsService } from "../intentions.service"

function fakeDb(rows: { purpose: string | null }[]) {
  const eq = jest.fn()
  const order = jest.fn()
  const limit = jest.fn().mockResolvedValue({ data: rows, error: null })
  const select = jest.fn(() => ({ eq }))
  eq.mockReturnValue({ order })
  order.mockReturnValue({ limit })

  return {
    db: { from: jest.fn(() => ({ select })) } as never,
    eq,
    order,
    limit
  }
}

describe("intentionsService.listRecentPurposes", () => {
  it("dedupes case-insensitively, keeping the most recent casing", async () => {
    const { db } = fakeDb([
      { purpose: "Campamento" },
      { purpose: "campamento " },
      { purpose: "Otro propósito" }
    ])

    const result = await intentionsService.listRecentPurposes(db, "user-1")

    expect(result).toEqual(["Campamento", "Otro propósito"])
  })

  it("caps the result at the given limit", async () => {
    const { db } = fakeDb([{ purpose: "A" }, { purpose: "B" }, { purpose: "C" }])

    const result = await intentionsService.listRecentPurposes(db, "user-1", 2)

    expect(result).toEqual(["A", "B"])
  })

  it("filters by the requesting user", async () => {
    const { db, eq } = fakeDb([{ purpose: "Solo mío" }])

    await intentionsService.listRecentPurposes(db, "user-42")

    expect(eq).toHaveBeenCalledWith("requested_by", "user-42")
  })

  it("returns an empty array for a user with no prior requests", async () => {
    const { db } = fakeDb([])

    const result = await intentionsService.listRecentPurposes(db, "user-1")

    expect(result).toEqual([])
  })

  it("skips null purposes without throwing", async () => {
    const { db } = fakeDb([{ purpose: null }, { purpose: "Válido" }])

    const result = await intentionsService.listRecentPurposes(db, "user-1")

    expect(result).toEqual(["Válido"])
  })

  it("preserves most-recent-first ordering from the query", async () => {
    const { db } = fakeDb([{ purpose: "Más reciente" }, { purpose: "Más antiguo" }])

    const result = await intentionsService.listRecentPurposes(db, "user-1")

    expect(result).toEqual(["Más reciente", "Más antiguo"])
  })

  it("throws when the query errors", async () => {
    const { db, limit } = fakeDb([])
    limit.mockResolvedValue({ data: null, error: new Error("boom") })

    await expect(intentionsService.listRecentPurposes(db, "user-1")).rejects.toThrow("boom")
  })
})
