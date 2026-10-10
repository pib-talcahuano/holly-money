import { notifyPendingComments } from "../comment-notifications.service"
import { sendCommentNotification } from "@/services/email/workflow-emails.service"

jest.mock("@/services/email/workflow-emails.service", () => ({
  sendCommentNotification: jest.fn()
}))

const send = sendCommentNotification as jest.MockedFunction<typeof sendCommentNotification>

const MINISTER = { id: "u-min", email: "min@x.cl", full_name: "Ana", status: "ACTIVE" }
const BURSAR = { id: "u-bur", email: "bur@x.cl", full_name: "Beto", status: "ACTIVE" }
const INTENTION = {
  id: "i-1",
  amount: 1000,
  purpose: "Campamento",
  requested_by: MINISTER.id,
  reviewed_by: BURSAR.id
}

function fakeDb(
  comments: Record<string, unknown>[],
  tables: Record<string, unknown[]> = {
    budget_intentions: [INTENTION],
    expense_settlements: [],
    users: [MINISTER, BURSAR]
  }
) {
  const updates: { table: string; values: unknown }[] = []
  const db = {
    from: jest.fn((table: string) => {
      if (table === "request_comments") {
        const chain: Record<string, jest.Mock> = {}
        chain.update = jest.fn((values: unknown) => {
          updates.push({ table, values })
          return chain
        })
        chain.is = jest.fn(() => chain)
        chain.select = jest.fn(() => chain)
        chain.order = jest.fn().mockResolvedValue({ data: comments, error: null })
        chain.in = jest.fn().mockResolvedValue({ error: null })
        return chain
      }
      const rows = tables[table] ?? []
      return {
        select: jest.fn(() => ({ in: jest.fn().mockResolvedValue({ data: rows }) }))
      }
    })
  }
  return { db: db as never, updates }
}

const comment = (over: Record<string, unknown>) => ({
  id: "c-1",
  entity_type: "INTENTION",
  entity_id: INTENTION.id,
  user_id: BURSAR.id,
  message: "hola",
  created_at: "2026-10-10T12:00:00Z",
  ...over
})

beforeEach(() => send.mockReset().mockResolvedValue(undefined))

describe("notifyPendingComments", () => {
  it("emails the requester when the reviewer comments, batching per request", async () => {
    const { db } = fakeDb([comment({ id: "c-1" }), comment({ id: "c-2", message: "otra" })])
    const result = await notifyPendingComments(db)
    expect(result).toEqual({ comments: 2, emails: 1, failed: 0 })
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0]![0]).toBe(MINISTER.email)
    expect(send.mock.calls[0]![3]).toHaveLength(2)
  })

  it("emails the reviewer when the requester comments", async () => {
    const { db } = fakeDb([comment({ user_id: MINISTER.id })])
    await notifyPendingComments(db)
    expect(send.mock.calls[0]![0]).toBe(BURSAR.email)
  })

  it("falls back to the treasury address while nobody has reviewed", async () => {
    const { db } = fakeDb([comment({ user_id: MINISTER.id })], {
      budget_intentions: [{ ...INTENTION, reviewed_by: null }],
      expense_settlements: [],
      users: [MINISTER]
    })
    await notifyPendingComments(db, { treasuryEmail: "tesoreria@x.cl" })
    expect(send.mock.calls[0]![0]).toBe("tesoreria@x.cl")
  })

  it("resolves settlement comments through the settlement's submitter", async () => {
    const { db } = fakeDb([comment({ entity_type: "SETTLEMENT", entity_id: "s-1" })], {
      budget_intentions: [INTENTION],
      expense_settlements: [
        { id: "s-1", intention_id: INTENTION.id, submitted_by: MINISTER.id, reviewed_by: null }
      ],
      users: [MINISTER, BURSAR]
    })
    await notifyPendingComments(db)
    expect(send.mock.calls[0]![0]).toBe(MINISTER.email)
  })

  it("releases the claim when sending fails so the next run retries", async () => {
    send.mockRejectedValue(new Error("resend down"))
    jest.spyOn(console, "error").mockImplementation(() => undefined)
    const { db, updates } = fakeDb([comment({})])
    const result = await notifyPendingComments(db)
    expect(result.failed).toBe(1)
    expect(updates.at(-1)?.values).toEqual({ notified_at: null })
  })

  it("does nothing when there are no pending comments", async () => {
    const { db } = fakeDb([])
    expect(await notifyPendingComments(db)).toEqual({ comments: 0, emails: 0, failed: 0 })
    expect(send).not.toHaveBeenCalled()
  })
})
