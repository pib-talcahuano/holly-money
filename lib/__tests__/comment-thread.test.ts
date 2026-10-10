import { buildCommentThread, type ThreadComment } from "../comment-thread"

const REQUESTER = "u-min"
const local = (day: number, h: number, m: number) => new Date(2026, 6, day, h, m).toISOString()

let n = 0
function comment(
  userId: string,
  name: string,
  roles: string[],
  at: string,
  message = "hola"
): ThreadComment {
  return {
    id: `c${++n}`,
    user_id: userId,
    message,
    created_at: at,
    users: { id: userId, full_name: name, roles }
  }
}

const minister = (at: string) => comment(REQUESTER, "E2E Minister", ["MINISTER"], at)
const bursar = (at: string) => comment("u-bur", "E2E Bursar", ["BURSAR"], at)

describe("buildCommentThread", () => {
  it("adds a date divider per day and resets grouping after it", () => {
    const items = buildCommentThread(
      [minister(local(16, 10, 2)), minister(local(16, 10, 3)), minister(local(17, 9, 0))],
      REQUESTER
    )
    expect(items.map((i) => i.type)).toEqual([
      "divider",
      "message",
      "message",
      "divider",
      "message"
    ])
    const [, a, b, , c] = items as Extract<(typeof items)[number], { type: "message" }>[]
    expect([a.first, a.last]).toEqual([true, false])
    expect([b.first, b.last]).toEqual([false, true])
    // new day starts a new run even with the same author
    expect([c.first, c.last, c.spaced]).toEqual([true, true, false])
  })

  it("groups consecutive messages by author and spaces new runs", () => {
    const items = buildCommentThread(
      [
        minister(local(16, 10, 2)),
        bursar(local(16, 11, 20)),
        bursar(local(16, 12, 5)),
        minister(local(16, 12, 30))
      ],
      REQUESTER
    ).filter((i) => i.type === "message") as Extract<
      ReturnType<typeof buildCommentThread>[number],
      { type: "message" }
    >[]

    expect(items.map((m) => [m.first, m.last, m.spaced])).toEqual([
      [true, true, false],
      [true, false, true],
      [false, true, false],
      [true, true, true]
    ])
  })

  it("puts the requester and ministry-side roles left, everyone else right", () => {
    const delegate = comment("u-del", "Carla Reyes", ["DELEGATE"], local(16, 10, 0))
    const admin = comment("u-adm", "E2E Admin", ["ADMIN"], local(16, 10, 1))
    const finance = comment("u-fin", "E2E Finance", ["FINANCE", "MINISTER"], local(16, 10, 2))
    const items = buildCommentThread(
      [minister(local(16, 9, 0)), delegate, admin, finance, bursar(local(16, 10, 3))],
      REQUESTER
    ).filter((i) => i.type === "message") as { side: string; role: string }[]

    expect(items.map((m) => m.side)).toEqual([
      "requester",
      "requester",
      "reviewer",
      "reviewer",
      "reviewer"
    ])
    expect(items.map((m) => m.role)).toEqual([
      "Solicitante",
      "Delegado",
      "Admin",
      "Finanzas",
      "Tesorería"
    ])
  })

  it("formats time as 24h HH:mm and falls back for a missing author", () => {
    const orphan: ThreadComment = {
      id: "x",
      user_id: "gone",
      message: "hi",
      created_at: local(16, 9, 5),
      users: null
    }
    const [, m] = buildCommentThread([orphan], REQUESTER) as [unknown, Record<string, string>]
    expect(m.time).toBe("09:05")
    expect(m.name).toBe("Usuario")
    expect(m.role).toBe("Revisor")
  })

  it("merges review events by time and breaks the author run", () => {
    const items = buildCommentThread(
      [bursar(local(16, 12, 5)), bursar(local(16, 12, 6))],
      REQUESTER,
      [{ id: "e1", kind: "APPROVED", actorName: "E2E Bursar", at: local(16, 12, 6) }]
    )
    const types = items.map((i) => i.type)
    expect(types).toEqual(["divider", "message", "message", "event"])
    expect(items[3]).toMatchObject({ text: "E2E Bursar aprobó la solicitud", time: "12:06" })
  })

  it("labels a rejection event", () => {
    const [, e] = buildCommentThread([], REQUESTER, [
      { id: "e", kind: "REJECTED", actorName: "Ana", at: local(16, 9, 0) }
    ])
    expect(e).toMatchObject({ type: "event", text: "Ana rechazó la solicitud" })
  })
})
