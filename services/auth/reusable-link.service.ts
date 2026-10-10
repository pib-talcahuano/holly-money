import { createHmac, timingSafeEqual } from "crypto"
import type { EmailOtpType } from "@supabase/supabase-js"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

// Keep in sync with [auth.email] otp_expiry in supabase/config.toml (and the dashboard value).
export const AUTH_LINK_TTL_SECONDS = 172800

export type ReusableLinkType = "magiclink" | "recovery"

interface Payload {
  email: string
  type: ReusableLinkType
}

function sign(body: string): string {
  return createHmac("sha256", process.env.SUPABASE_SECRET_KEY ?? "")
    .update(body)
    .digest("base64url")
}

export function signAuthLink({ email, type }: Payload): string {
  const x = Math.floor(Date.now() / 1000) + AUTH_LINK_TTL_SECONDS
  const body = Buffer.from(JSON.stringify({ e: email, t: type, x })).toString("base64url")
  return `${body}.${sign(body)}`
}

export function verifyAuthLinkToken(token: string): Payload | null {
  const [body, sig] = token.split(".")
  if (!body || !sig) return null

  const expected = Buffer.from(sign(body))
  const actual = Buffer.from(sig)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null

  try {
    const { e, t, x } = JSON.parse(Buffer.from(body, "base64url").toString()) as {
      e?: unknown
      t?: unknown
      x?: unknown
    }
    if (typeof e !== "string" || typeof x !== "number") return null
    if (t !== "magiclink" && t !== "recovery") return null
    if (x < Math.floor(Date.now() / 1000)) return null
    return { email: e, type: t }
  } catch {
    return null
  }
}

/**
 * Supabase OTPs are single-use, so a reusable link mints a fresh OTP on every visit.
 * Only accounts still waiting to be activated/reset can use it; once the password is set the
 * link stops working even before its expiry.
 */
export async function mintOtpForLink(
  token: string
): Promise<{ token_hash: string; type: EmailOtpType } | null> {
  const payload = verifyAuthLinkToken(token)
  if (!payload) return null

  const admin = createSupabaseAdminClient()
  const { data: profile } = await admin
    .from("users")
    .select("status")
    .eq("email", payload.email)
    .maybeSingle()

  if (!profile || (profile.status !== "PENDING_ACTIVATION" && profile.status !== "PENDING_RESET")) {
    return null
  }

  const { data, error } = await admin.auth.admin.generateLink({
    type: payload.type,
    email: payload.email
  })
  if (error || !data.properties.hashed_token) return null

  return { token_hash: data.properties.hashed_token, type: payload.type }
}
