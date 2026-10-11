/** @jest-environment node */
import { NextRequest } from "next/server"
import { proxy } from "../proxy"

jest.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser: () => Promise.resolve({ data: { user: null } }) } })
}))

const call = (path: string) =>
  proxy(new NextRequest(`http://localhost:3000${path}`, { method: "POST" }))

describe("proxy (unauthenticated requests)", () => {
  it.each(["/api/reminders", "/api/webhooks/resend-inbound", "/api/comment-notifications"])(
    "lets %s through so the handler can check its own secret/signature",
    async (path) => {
      const res = await call(path)
      expect(res.status).toBe(200)
      expect(res.headers.get("location")).toBeNull()
    }
  )

  it.each(["/api/movements", "/dashboard", "/requests"])("redirects %s to login", async (path) => {
    const res = await call(path)
    expect(res.status).toBe(307)
    expect(new URL(res.headers.get("location")!).pathname).toBe("/")
  })
})
