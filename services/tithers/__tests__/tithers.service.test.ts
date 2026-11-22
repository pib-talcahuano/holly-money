import { tithersService } from "../tithers.service"

type Result = { data: unknown; error: unknown }

function chain(results: Result | ((call: number, args: unknown[][]) => Result)) {
  const calls: Record<string, unknown[][]> = {}
  const proxy: Record<string, unknown> = {}
  let rangeCalls = 0
  const record =
    (name: string) =>
    (...args: unknown[]) => {
      ;(calls[name] ??= []).push(args)
      return proxy
    }
  for (const m of ["select", "order", "eq", "gte", "lte"]) proxy[m] = record(m)
  proxy.range = (...args: unknown[]) => {
    ;(calls.range ??= []).push(args)
    const current = typeof results === "function" ? results(rangeCalls, [args]) : results
    rangeCalls += 1
    return Promise.resolve(current)
  }
  proxy.maybeSingle = () =>
    Promise.resolve(typeof results === "function" ? results(0, []) : results)
  return { proxy, calls }
}

function makeDb(opts: { category: Result; movements?: Parameters<typeof chain>[0] }) {
  const category = chain(opts.category)
  const movements = chain(opts.movements ?? { data: [], error: null })
  const from = jest.fn((table: string) =>
    table === "movement_categories" ? category.proxy : movements.proxy
  )
  return { db: { from } as never, from, category, movements }
}

const found = { data: { id: "cat-1" }, error: null }

function rows(n: number, amount: string | number = "1") {
  return Array.from({ length: n }, (_, i) => ({
    delivered_by: "Ana",
    amount,
    movement_date: `2026-03-${String((i % 28) + 1).padStart(2, "0")}`
  }))
}

describe("tithersService.list", () => {
  it("returns an empty result without querying movements when the category is missing", async () => {
    const t = makeDb({ category: { data: null, error: null } })
    const result = await tithersService.list(t.db, { year: 2026 })
    expect(result).toEqual({
      categoryFound: false,
      tithers: [],
      totals: { total: 0, count: 0, titherCount: 0 }
    })
    expect(t.from).not.toHaveBeenCalledWith("movements")
    expect(t.category.calls.eq).toEqual([
      ["name", "Diezmos"],
      ["movement_type", "INCOME"]
    ])
  })

  it("queries the year's active movements of the category in a deterministic order", async () => {
    const t = makeDb({ category: found, movements: { data: [], error: null } })
    const result = await tithersService.list(t.db, { year: 2026 })
    expect(result.categoryFound).toBe(true)
    expect(t.movements.calls.select).toEqual([["delivered_by, amount, movement_date"]])
    expect(t.movements.calls.eq).toEqual([
      ["category_id", "cat-1"],
      ["status", "ACTIVE"]
    ])
    expect(t.movements.calls.gte).toEqual([["movement_date", "2026-01-01"]])
    expect(t.movements.calls.lte).toEqual([["movement_date", "2026-12-31"]])
    expect(t.movements.calls.order).toEqual([
      ["movement_date", { ascending: false }],
      ["created_at", { ascending: false }],
      ["id", { ascending: false }]
    ])
  })

  it("paginates 1000 rows at a time and groups every row", async () => {
    const pages = [rows(1000), rows(1000), rows(250)]
    const t = makeDb({
      category: found,
      movements: (call) => ({ data: pages[call], error: null })
    })
    const result = await tithersService.list(t.db, { year: 2026 })
    expect(t.movements.calls.range).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999]
    ])
    expect(result.tithers).toHaveLength(1)
    expect(result.tithers[0].count).toBe(2250)
    expect(result.totals).toEqual({ total: 2250, count: 2250, titherCount: 1 })
  })

  it("requests an empty second page when the first has exactly 1000 rows", async () => {
    const t = makeDb({
      category: found,
      movements: (call) => ({ data: call === 0 ? rows(1000) : [], error: null })
    })
    const result = await tithersService.list(t.db, { year: 2026 })
    expect(t.movements.calls.range).toEqual([
      [0, 999],
      [1000, 1999]
    ])
    expect(result.totals.count).toBe(1000)
  })

  it("converts text amounts with Number", async () => {
    const t = makeDb({
      category: found,
      movements: { data: rows(1, "20000.50"), error: null }
    })
    const result = await tithersService.list(t.db, { year: 2026 })
    expect(result.totals.total).toBe(20000.5)
  })

  it("throws a category lookup error", async () => {
    const err = new Error("boom")
    const t = makeDb({ category: { data: null, error: err } })
    await expect(tithersService.list(t.db, { year: 2026 })).rejects.toBe(err)
  })

  it("throws a page error", async () => {
    const err = new Error("page")
    const t = makeDb({
      category: found,
      movements: (call) =>
        call === 0 ? { data: rows(1000), error: null } : { data: null, error: err }
    })
    await expect(tithersService.list(t.db, { year: 2026 })).rejects.toBe(err)
  })
})
