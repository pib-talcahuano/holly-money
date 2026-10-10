/**
 * @jest-environment node
 */
import { wrapAuthLink } from "../link-wrapper"
import { verifyAuthLinkToken } from "../reusable-link.service"

const SUPABASE_URL = "http://localhost:54321"
const SITE_URL = "https://pibtalcahuano.com"

const makeSupabaseLink = (params: Record<string, string>) => {
  const url = new URL(`${SUPABASE_URL}/auth/v1/verify`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return url.toString()
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = SITE_URL
  process.env.SUPABASE_SECRET_KEY = "test-secret"
})

describe("wrapAuthLink", () => {
  it("wraps the link through the custom domain with a signed token and no OTP", () => {
    const result = wrapAuthLink(makeSupabaseLink({ token: "abc123", type: "invite" }), "a@b.cl")

    const url = new URL(result)
    expect(url.origin).toBe(SITE_URL)
    expect(url.pathname).toBe("/api/auth/verify")
    expect(url.searchParams.get("token")).toBeNull()
    expect(verifyAuthLinkToken(url.searchParams.get("s")!)).toEqual({
      email: "a@b.cl",
      type: "magiclink"
    })
  })

  it("keeps recovery links as recovery", () => {
    const result = wrapAuthLink(makeSupabaseLink({ token: "xyz", type: "recovery" }), "a@b.cl")
    expect(verifyAuthLinkToken(new URL(result).searchParams.get("s")!)?.type).toBe("recovery")
  })

  it("returns the original link when type is missing", () => {
    const link = makeSupabaseLink({ token: "abc" })
    expect(wrapAuthLink(link, "a@b.cl")).toBe(link)
  })
})
