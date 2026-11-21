import { movementsService } from "../movements.service"

type Result = { data: unknown; error: unknown; count?: number }

function chain(result: Result) {
  const calls: Record<string, unknown[][]> = {}
  const proxy: Record<string, unknown> = {}
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      ;(calls[name] ??= []).push(args)
      return proxy
    }
  for (const m of ["select", "order", "range", "eq", "ilike", "or"]) proxy[m] = record(m)
  proxy.then = (resolve: (v: Result) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject)
  return { proxy, calls }
}

function makeDb(opts: { categories?: Result; subcategories?: Result; movements?: Result }) {
  const categories = chain(opts.categories ?? { data: [], error: null })
  const subcategories = chain(opts.subcategories ?? { data: [], error: null })
  const movements = chain(opts.movements ?? { data: [], error: null, count: 0 })
  const from = jest.fn((table: string) => {
    if (table === "movement_categories") return categories.proxy
    if (table === "movement_subcategories") return subcategories.proxy
    return movements.proxy
  })
  return { db: { from } as never, from, categories, subcategories, movements }
}

describe("movementsService.list search", () => {
  it("looks up categories and subcategories by name with ilike", async () => {
    const t = makeDb({})
    await movementsService.list(t.db, { search: "diez" })
    expect(t.from).toHaveBeenCalledWith("movement_categories")
    expect(t.from).toHaveBeenCalledWith("movement_subcategories")
    expect(t.categories.calls.ilike).toEqual([["name", "%diez%"]])
    expect(t.subcategories.calls.ilike).toEqual([["name", "%diez%"]])
  })

  it("builds the or filter from lookup ids and text columns", async () => {
    const t = makeDb({
      categories: { data: [{ id: "c1" }, { id: "c2" }], error: null },
      subcategories: { data: [{ id: "s1" }], error: null }
    })
    await movementsService.list(t.db, { search: "diez" })
    expect(t.movements.calls.or).toHaveLength(1)
    const filter = t.movements.calls.or[0][0] as string
    expect(filter).toContain("category_id.in.(c1,c2)")
    expect(filter).toContain("subcategory_id.in.(s1)")
    expect(filter).toContain("delivered_by.ilike")
    expect(filter).toContain("notes.ilike")
  })

  it("keeps movement_type and status filters alongside the search", async () => {
    const t = makeDb({})
    await movementsService.list(t.db, {
      search: "diez",
      movement_type: "INCOME",
      status: "ACTIVE"
    })
    expect(t.movements.calls.eq).toEqual([
      ["movement_type", "INCOME"],
      ["status", "ACTIVE"]
    ])
    expect(t.movements.calls.or).toHaveLength(1)
  })

  it("throws when the category lookup fails", async () => {
    const t = makeDb({ categories: { data: null, error: new Error("cat boom") } })
    await expect(movementsService.list(t.db, { search: "diez" })).rejects.toThrow("cat boom")
  })

  it("throws when the subcategory lookup fails", async () => {
    const t = makeDb({ subcategories: { data: null, error: new Error("sub boom") } })
    await expect(movementsService.list(t.db, { search: "diez" })).rejects.toThrow("sub boom")
  })

  it("does not call or() nor look up categories when the search is empty", async () => {
    const t = makeDb({})
    await movementsService.list(t.db, { search: "   " })
    expect(t.movements.calls.or).toBeUndefined()
    expect(t.from).not.toHaveBeenCalledWith("movement_categories")
  })
})
