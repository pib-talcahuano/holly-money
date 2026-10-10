/**
 * @jest-environment node
 */
import { signAuthLink, verifyAuthLinkToken } from "../reusable-link.service"

beforeEach(() => {
  process.env.SUPABASE_SECRET_KEY = "test-secret"
  jest.useFakeTimers().setSystemTime(new Date("2026-01-01T00:00:00Z"))
})

afterEach(() => jest.useRealTimers())

describe("reusable auth link token", () => {
  it("round-trips email and type", () => {
    const token = signAuthLink({ email: "a@b.cl", type: "recovery" })
    expect(verifyAuthLinkToken(token)).toEqual({ email: "a@b.cl", type: "recovery" })
  })

  it("can be verified repeatedly within the ttl", () => {
    const token = signAuthLink({ email: "a@b.cl", type: "magiclink" })
    jest.setSystemTime(new Date("2026-01-02T23:59:00Z"))
    expect(verifyAuthLinkToken(token)).not.toBeNull()
    expect(verifyAuthLinkToken(token)).not.toBeNull()
  })

  it("rejects after the ttl", () => {
    const token = signAuthLink({ email: "a@b.cl", type: "magiclink" })
    jest.setSystemTime(new Date("2026-01-03T00:00:01Z"))
    expect(verifyAuthLinkToken(token)).toBeNull()
  })

  it("rejects a tampered payload", () => {
    const token = signAuthLink({ email: "a@b.cl", type: "magiclink" })
    const [, sig] = token.split(".")
    const forged = Buffer.from(
      JSON.stringify({ e: "admin@b.cl", t: "magiclink", x: 9999999999 })
    ).toString("base64url")
    expect(verifyAuthLinkToken(`${forged}.${sig}`)).toBeNull()
  })

  it("rejects garbage", () => {
    expect(verifyAuthLinkToken("nope")).toBeNull()
  })
})
