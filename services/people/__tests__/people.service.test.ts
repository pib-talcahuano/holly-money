import { auditService } from "@/services/audit/audit.service"
import { peopleService } from "../people.service"

jest.mock("@/services/audit/audit.service", () => ({
  auditService: {
    logMovementsBulk: jest.fn(),
    logSystem: jest.fn()
  }
}))

type Result = { data: unknown; error: unknown }

type AuditEntry = { movement_id: string; note: string; [key: string]: unknown }
type SystemEntry = { new_value: Record<string, unknown> }

const logMovementsBulk = auditService.logMovementsBulk as jest.MockedFunction<
  (entries: AuditEntry[]) => Promise<void>
>
const logSystem = auditService.logSystem as unknown as jest.MockedFunction<
  (entry: SystemEntry) => Promise<{ error: unknown }>
>

function makeDb(opts: { pages?: Result[]; updates?: Result[] }) {
  const pages = [...(opts.pages ?? [])]
  const updates = [...(opts.updates ?? [])]
  const selects: unknown[][] = []
  const eqs: unknown[][] = []
  const orders: unknown[][] = []
  const ranges: unknown[][] = []
  const updateArgs: unknown[][] = []
  const updateEqs: unknown[][] = []
  const events: string[] = []
  const inArgs: unknown[][] = []
  const forbidden: string[] = []
  const from = jest.fn((table: string) => {
    const state = { updating: false, ranged: false }
    const proxy: Record<string, unknown> = {}
    proxy.select = (...a: unknown[]) => {
      selects.push([table, ...a])
      return proxy
    }
    proxy.eq = (...a: unknown[]) => {
      if (state.updating) updateEqs.push(a)
      else eqs.push(a)
      return proxy
    }
    proxy.order = (...a: unknown[]) => {
      orders.push(a)
      return proxy
    }
    proxy.range = (...a: unknown[]) => {
      ranges.push(a)
      state.ranged = true
      return proxy
    }
    proxy.update = (...a: unknown[]) => {
      updateArgs.push(a)
      events.push("update")
      state.updating = true
      return proxy
    }
    proxy.in = (...a: unknown[]) => {
      inArgs.push(a)
      return proxy
    }
    for (const m of ["ilike", "or", "filter", "not", "like", "neq"]) {
      proxy[m] = () => {
        forbidden.push(m)
        return proxy
      }
    }
    proxy.then = (resolve: (v: Result) => unknown, reject: (e: unknown) => unknown) => {
      const next = state.updating ? updates.shift() : pages.shift()
      return Promise.resolve(next ?? { data: [], error: null }).then(resolve, reject)
    }
    return proxy
  })
  return {
    db: { from } as never,
    from,
    selects,
    eqs,
    orders,
    ranges,
    updateArgs,
    updateEqs,
    events,
    inArgs,
    forbidden
  }
}

function idRows(count: number, name: string, offset = 0) {
  return Array.from({ length: count }, (_, i) => ({
    id: `id-${offset + i}`,
    delivered_by: name
  }))
}

let consoleError: jest.SpyInstance

beforeEach(() => {
  jest.clearAllMocks()
  logMovementsBulk.mockResolvedValue(undefined)
  logSystem.mockResolvedValue({ error: null })
  consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined)
})

afterEach(() => {
  consoleError.mockRestore()
})

describe("peopleService.list", () => {
  it("pages 1000 at a time until an incomplete page and groups all rows", async () => {
    const row = (n: string) => ({
      delivered_by: n,
      amount: 10,
      movement_date: "2026-01-01",
      status: "ACTIVE"
    })
    const first = Array.from({ length: 1000 }, () => row("Ana"))
    const t = makeDb({
      pages: [
        { data: first, error: null },
        { data: [row("Ana"), row("Luis")], error: null }
      ]
    })
    const result = await peopleService.list(t.db, { movementType: "INCOME" })
    expect(t.from).toHaveBeenCalledWith("movements")
    expect(t.selects[0]).toEqual(["movements", "delivered_by, amount, movement_date, status"])
    expect(t.eqs).toEqual([
      ["movement_type", "INCOME"],
      ["movement_type", "INCOME"]
    ])
    expect(t.ranges).toEqual([
      [0, 999],
      [1000, 1999]
    ])
    expect(t.orders.map((o) => o[0])).toEqual([
      "movement_date",
      "created_at",
      "id",
      "movement_date",
      "created_at",
      "id"
    ])
    expect(result.map((p) => [p.name, p.count])).toEqual([
      ["Ana", 1001],
      ["Luis", 1]
    ])
  })

  it("throws the database error", async () => {
    const t = makeDb({ pages: [{ data: null, error: new Error("list boom") }] })
    await expect(peopleService.list(t.db, { movementType: "INCOME" })).rejects.toThrow("list boom")
  })
})

describe("peopleService.preview", () => {
  it("counts exact spellings in TypeScript without name filters", async () => {
    const tricky = 'Ana, (Pérez) "la"'
    const t = makeDb({
      pages: [
        {
          data: [
            { id: "1", delivered_by: tricky },
            { id: "2", delivered_by: "Ana" },
            { id: "3", delivered_by: "ana" },
            { id: "4", delivered_by: "Ana Maria" },
            { id: "5", delivered_by: null },
            { id: "6", delivered_by: tricky }
          ],
          error: null
        }
      ]
    })
    const result = await peopleService.preview(t.db, {
      movementType: "INCOME",
      fromNames: [tricky, "Ana", tricky, "No existe"],
      toName: "Ana Maria"
    })
    expect(result).toEqual({ affected: 3 })
    expect(t.selects[0]).toEqual(["movements", "id, delivered_by"])
    expect(t.forbidden).toEqual([])
    expect(t.inArgs).toEqual([])
  })

  it("does not count movements already named toName", async () => {
    const t = makeDb({ pages: [{ data: idRows(2, "Ana"), error: null }] })
    const result = await peopleService.preview(t.db, {
      movementType: "INCOME",
      fromNames: ["Ana"],
      toName: "  Ana "
    })
    expect(result).toEqual({ affected: 0 })
  })

  it("rejects empty origin names", async () => {
    const t = makeDb({})
    await expect(
      peopleService.preview(t.db, { movementType: "INCOME", fromNames: ["  "], toName: "Ana" })
    ).rejects.toThrow()
    expect(t.from).not.toHaveBeenCalled()
  })
})

describe("peopleService.merge validation", () => {
  const base = { movementType: "INCOME" as const, userId: "u1" }

  it.each([
    ["empty fromNames", { fromNames: [], toName: "Ana" }],
    ["empty toName", { fromNames: ["a"], toName: "  " }],
    ["too long toName", { fromNames: ["a"], toName: "x".repeat(101) }],
    ["empty origin", { fromNames: ["a", ""], toName: "Ana" }],
    ["whitespace origin", { fromNames: ["a", "   "], toName: "Ana" }],
    ["null origin", { fromNames: ["a", null as unknown as string], toName: "Ana" }]
  ])("rejects %s without touching the database", async (_label, input) => {
    const t = makeDb({})
    await expect(peopleService.merge(t.db, { ...base, ...input })).rejects.toThrow()
    expect(t.from).not.toHaveBeenCalled()
    expect(logMovementsBulk).not.toHaveBeenCalled()
    expect(logSystem).not.toHaveBeenCalled()
  })
})

describe("peopleService.merge", () => {
  const base = { movementType: "INCOME" as const, userId: "u1" }
  const ids = (count: number, offset = 0) =>
    Array.from({ length: count }, (_, i) => ({ id: `id-${offset + i}` }))

  it("returns 0 and writes nothing when no movement matches", async () => {
    const t = makeDb({ pages: [{ data: idRows(3, "Otro"), error: null }] })
    const result = await peopleService.merge(t.db, { ...base, fromNames: ["Ana"], toName: "Ana M" })
    expect(result).toEqual({ updated: 0 })
    expect(t.updateArgs).toEqual([])
    expect(logMovementsBulk).not.toHaveBeenCalled()
    expect(logSystem).not.toHaveBeenCalled()
  })

  it("skips movements already named toName even when toName is a source", async () => {
    const t = makeDb({
      pages: [
        {
          data: [
            { id: "a", delivered_by: "Ana M" },
            { id: "b", delivered_by: "ana" }
          ],
          error: null
        }
      ],
      updates: [{ data: [{ id: "b" }], error: null }]
    })
    const result = await peopleService.merge(t.db, {
      ...base,
      fromNames: ["Ana M", "ana"],
      toName: "Ana M"
    })
    expect(result).toEqual({ updated: 1 })
    expect(t.inArgs).toEqual([["id", ["b"]]])
  })

  it("updates per old name in chunks of 200, guarded by type and old name", async () => {
    const rows = [
      ...idRows(250, "ana"),
      { id: "o1", delivered_by: "Ana  " },
      { id: "x", delivered_by: "Otra" }
    ]
    const t = makeDb({
      pages: [{ data: rows, error: null }],
      updates: [
        { data: ids(200), error: null },
        { data: ids(50, 200), error: null },
        { data: [{ id: "o1" }], error: null }
      ]
    })
    const result = await peopleService.merge(t.db, {
      ...base,
      fromNames: ["ana", "ana", "Ana  "],
      toName: "  Ana   Maria "
    })
    expect(result).toEqual({ updated: 251 })
    expect(t.from).toHaveBeenCalledTimes(4)
    expect(t.inArgs.map((a) => (a[1] as string[]).length)).toEqual([200, 50, 1])
    expect(t.inArgs.every((a) => a[0] === "id")).toBe(true)
    expect(t.updateEqs).toEqual([
      ["movement_type", "INCOME"],
      ["delivered_by", "ana"],
      ["movement_type", "INCOME"],
      ["delivered_by", "ana"],
      ["movement_type", "INCOME"],
      ["delivered_by", "Ana  "]
    ])
    expect(t.forbidden).toEqual([])

    const patch = t.updateArgs[0][0] as Record<string, unknown>
    const { updated_at: updatedAt, ...patchRest } = patch
    expect(patchRest).toEqual({ delivered_by: "Ana Maria", updated_by_id: "u1" })
    expect(updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(t.selects.filter((s) => s[1] === "id")).toHaveLength(3)

    const audited = logMovementsBulk.mock.calls.flatMap((c) => c[0])
    expect(audited).toHaveLength(251)
    const { note: firstNote, ...firstRest } = audited[0]
    expect(firstRest).toEqual({
      movement_id: "id-0",
      action: "Nombre actualizado",
      user_id: "u1",
      previous_value: { delivered_by: "ana" },
      new_value: { delivered_by: "Ana Maria" }
    })
    expect(firstNote).toMatch(/^Unión de nombres [0-9a-f-]{36}$/)
    expect(audited[250]).toMatchObject({
      movement_id: "o1",
      previous_value: { delivered_by: "Ana  " }
    })
    const notes = new Set(audited.map((a: { note: string }) => a.note))
    expect(notes.size).toBe(1)

    expect(logSystem).toHaveBeenCalledTimes(2)
    const sys = logSystem.mock.calls[1][0]
    const { merge_id: mergeId, ...sysValue } = sys.new_value
    expect(typeof mergeId).toBe("string")
    expect({ ...sys, new_value: sysValue }).toEqual({
      entity: "people",
      action: "Nombres unidos",
      user_id: "u1",
      new_value: {
        movement_type: "INCOME",
        from_names: ["ana", "Ana  "],
        to_name: "Ana Maria",
        updated: 251
      }
    })
    expect([...notes][0]).toContain(mergeId)
  })

  it("writes the start audit entry before the first update", async () => {
    const t = makeDb({
      pages: [{ data: idRows(2, "ana"), error: null }],
      updates: [{ data: ids(2), error: null }]
    })
    logSystem.mockImplementation((entry) => {
      t.events.push(`system:${(entry as unknown as { action: string }).action}`)
      return Promise.resolve({ error: null })
    })
    logMovementsBulk.mockImplementation(() => {
      t.events.push("audit")
      return Promise.resolve()
    })
    await peopleService.merge(t.db, { ...base, fromNames: ["ana"], toName: "Ana M" })
    expect(t.events).toEqual([
      "system:Unión de nombres iniciada",
      "update",
      "audit",
      "system:Nombres unidos"
    ])
    const start = logSystem.mock.calls[0][0] as unknown as {
      entity: string
      new_value: Record<string, unknown>
    }
    expect(start.entity).toBe("people")
    const { merge_id: startId, ...startRest } = start.new_value
    expect(startRest).toEqual({
      movement_type: "INCOME",
      from_names: ["ana"],
      to_name: "Ana M",
      expected: 2
    })
    expect((logSystem.mock.calls[1][0] as SystemEntry).new_value.merge_id).toBe(startId)
  })

  it("does not update anything when the start audit entry fails", async () => {
    logSystem.mockResolvedValue({ error: new Error("sys boom") })
    const t = makeDb({ pages: [{ data: idRows(2, "ana"), error: null }] })
    await expect(
      peopleService.merge(t.db, { ...base, fromNames: ["ana"], toName: "Ana M" })
    ).rejects.toThrow(/No se modificó nada/)
    expect(t.updateArgs).toEqual([])
  })

  it("reports a short Spanish error when the guard skips rows changed meanwhile", async () => {
    const t = makeDb({
      pages: [{ data: idRows(5, "ana"), error: null }],
      updates: [{ data: ids(3), error: null }]
    })
    const error = await peopleService
      .merge(t.db, { ...base, fromNames: ["ana"], toName: "Ana M" })
      .catch((e: Error) => e)
    const message = (error as Error).message
    expect(message).toMatch(
      /^No se pudieron unir todos los nombres: se actualizaron 3 de 5 movimientos y faltan 0 entradas de auditoría \(unión [0-9a-f-]{36}\)\. Puedes volver a intentarlo\.$/
    )
    expect(logMovementsBulk.mock.calls.flatMap((c) => c[0])).toHaveLength(3)
  })

  it("keeps raw audit errors out of the message and logs them", async () => {
    logMovementsBulk.mockRejectedValue(new Error("audit boom"))
    const t = makeDb({
      pages: [{ data: idRows(3, "ana"), error: null }],
      updates: [{ data: ids(3), error: null }]
    })
    const error = await peopleService
      .merge(t.db, { ...base, fromNames: ["ana"], toName: "Ana M" })
      .catch((e: Error) => e)
    const message = (error as Error).message
    expect(message).toContain("se actualizaron 3 de 3 movimientos y faltan 3 entradas de auditoría")
    expect(message).not.toContain("audit boom")
    expect(consoleError).toHaveBeenCalled()
  })

  it("keeps raw update errors out of the message, logs them and continues", async () => {
    const t = makeDb({
      pages: [{ data: idRows(250, "ana"), error: null }],
      updates: [
        { data: null, error: new Error("update boom") },
        { data: ids(50, 200), error: null }
      ]
    })
    const error = await peopleService
      .merge(t.db, { ...base, fromNames: ["ana"], toName: "Ana M" })
      .catch((e: Error) => e)
    const message = (error as Error).message
    expect(message).toContain("se actualizaron 50 de 250 movimientos")
    expect(message).not.toContain("update boom")
    expect(consoleError).toHaveBeenCalled()
    expect(logMovementsBulk.mock.calls.flatMap((c) => c[0])).toHaveLength(50)
  })

  it("refuses more than 5000 movements without writing anything", async () => {
    const page = (offset: number) => ({
      data: idRows(1000, "ana", offset),
      error: null
    })
    const pages = [0, 1, 2, 3, 4, 5].map((n) => page(n * 1000))
    const t = makeDb({ pages: [...pages, { data: idRows(1, "ana", 6000), error: null }] })
    await expect(
      peopleService.merge(t.db, { ...base, fromNames: ["ana"], toName: "Ana M" })
    ).rejects.toThrow("Demasiados movimientos en una sola unión (6001). El máximo es 5000.")
    expect(t.updateArgs).toEqual([])
    expect(logSystem).not.toHaveBeenCalled()
    expect(logMovementsBulk).not.toHaveBeenCalled()
  })

  it("preview applies the same cap", async () => {
    const pages = [0, 1, 2, 3, 4, 5].map((n) => ({
      data: idRows(1000, "ana", n * 1000),
      error: null
    }))
    const t = makeDb({ pages })
    await expect(
      peopleService.preview(t.db, { movementType: "INCOME", fromNames: ["ana"], toName: "Ana M" })
    ).rejects.toThrow(/Demasiados movimientos en una sola unión \(6000\)/)
  })
})
