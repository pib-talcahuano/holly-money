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
      eqs.push(a)
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

beforeEach(() => {
  jest.clearAllMocks()
  logMovementsBulk.mockResolvedValue(undefined)
  logSystem.mockResolvedValue({ error: null })
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

  it("updates in chunks of 200 and audits each updated movement", async () => {
    const rows = [...idRows(250, "ana"), { id: "x", delivered_by: "Otra" }]
    const t = makeDb({
      pages: [{ data: rows, error: null }],
      updates: [
        { data: idRows(200, "").map((r) => ({ id: r.id })), error: null },
        { data: idRows(50, "", 200).map((r) => ({ id: r.id })), error: null }
      ]
    })
    const result = await peopleService.merge(t.db, {
      ...base,
      fromNames: ["ana", "ana"],
      toName: "  Ana   Maria "
    })
    expect(result).toEqual({ updated: 250 })
    expect(t.from).toHaveBeenCalledTimes(3)
    expect(t.inArgs.map((a) => (a[1] as string[]).length)).toEqual([200, 50])
    expect(t.inArgs.every((a) => a[0] === "id")).toBe(true)
    expect(t.forbidden).toEqual([])

    const patch = t.updateArgs[0][0] as Record<string, unknown>
    const { updated_at: updatedAt, ...patchRest } = patch
    expect(patchRest).toEqual({ delivered_by: "Ana Maria", updated_by_id: "u1" })
    expect(updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(t.selects.filter((s) => s[1] === "id")).toHaveLength(2)

    const audited = logMovementsBulk.mock.calls.flatMap((c) => c[0])
    expect(audited).toHaveLength(250)
    const { note: firstNote, ...firstRest } = audited[0]
    expect(firstRest).toEqual({
      movement_id: "id-0",
      action: "Nombre actualizado",
      user_id: "u1",
      previous_value: { delivered_by: "ana" },
      new_value: { delivered_by: "Ana Maria" }
    })
    expect(firstNote).toMatch(/^Unión de nombres [0-9a-f-]{36}$/)
    const notes = new Set(audited.map((a: { note: string }) => a.note))
    expect(notes.size).toBe(1)

    expect(logSystem).toHaveBeenCalledTimes(1)
    const sys = logSystem.mock.calls[0][0]
    const { merge_id: mergeId, ...sysValue } = sys.new_value
    expect(typeof mergeId).toBe("string")
    expect({ ...sys, new_value: sysValue }).toEqual({
      entity: "people",
      action: "Nombres unidos",
      user_id: "u1",
      new_value: {
        movement_type: "INCOME",
        from_names: ["ana"],
        to_name: "Ana Maria",
        updated: 250
      }
    })
    expect([...notes][0]).toContain(mergeId)
  })

  it("throws one error with the counts when an update returns fewer ids", async () => {
    const t = makeDb({
      pages: [{ data: idRows(250, "ana"), error: null }],
      updates: [
        { data: idRows(199, "").map((r) => ({ id: r.id })), error: null },
        { data: idRows(50, "", 200).map((r) => ({ id: r.id })), error: null }
      ]
    })
    const error = await peopleService
      .merge(t.db, { ...base, fromNames: ["ana"], toName: "Ana M" })
      .catch((e: Error) => e)
    expect(error).toBeInstanceOf(Error)
    const message = (error as Error).message
    expect(message).toContain("249")
    expect(message).toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/)
    expect(logMovementsBulk.mock.calls.flatMap((c) => c[0])).toHaveLength(249)
  })

  it("throws one error when the audit fails after updating", async () => {
    logMovementsBulk.mockRejectedValue(new Error("audit boom"))
    const t = makeDb({
      pages: [{ data: idRows(3, "ana"), error: null }],
      updates: [{ data: [{ id: "id-0" }, { id: "id-1" }, { id: "id-2" }], error: null }]
    })
    const error = await peopleService
      .merge(t.db, { ...base, fromNames: ["ana"], toName: "Ana M" })
      .catch((e: Error) => e)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain("3")
    expect((error as Error).message).toContain("audit boom")
  })

  it("throws when the update itself errors, after trying the rest", async () => {
    const t = makeDb({
      pages: [{ data: idRows(250, "ana"), error: null }],
      updates: [
        { data: null, error: new Error("update boom") },
        { data: idRows(50, "", 200).map((r) => ({ id: r.id })), error: null }
      ]
    })
    await expect(
      peopleService.merge(t.db, { ...base, fromNames: ["ana"], toName: "Ana M" })
    ).rejects.toThrow(/update boom/)
    expect(logMovementsBulk.mock.calls.flatMap((c) => c[0])).toHaveLength(50)
  })
})
