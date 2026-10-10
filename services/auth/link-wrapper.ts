import { getSiteUrl } from "@/lib/utils"
import { signAuthLink } from "./reusable-link.service"

/**
 * Wraps a Supabase action link in our own /api/auth/verify URL. The wrapped link carries a signed,
 * expiring token instead of Supabase's single-use OTP, so it can be opened more than once until
 * it expires (the verify route mints a fresh OTP on each visit).
 */
export function wrapAuthLink(supabaseLink: string, email: string): string {
  const type = new URL(supabaseLink).searchParams.get("type")
  if (!type) return supabaseLink

  const wrapped = new URL(`${getSiteUrl()}/api/auth/verify`)
  wrapped.searchParams.set(
    "s",
    signAuthLink({ email, type: type === "recovery" ? "recovery" : "magiclink" })
  )
  return wrapped.toString()
}
