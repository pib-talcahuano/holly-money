import { NextRequest, NextResponse } from "next/server"
import type { EmailOtpType } from "@supabase/supabase-js"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { mintOtpForLink } from "@/services/auth/reusable-link.service"

const VALID_TYPES: EmailOtpType[] = [
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email"
]

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const signed = searchParams.get("s")
  let token_hash = searchParams.get("token")
  let type = searchParams.get("type")

  if (signed) {
    // Reusable link: exchange the signed token for a fresh single-use OTP on every visit.
    const otp = await mintOtpForLink(signed)
    if (!otp) return NextResponse.redirect(new URL("/?error=link_expired", req.nextUrl.origin))
    token_hash = otp.token_hash
    type = otp.type
  }

  if (!token_hash || !type || !VALID_TYPES.includes(type as EmailOtpType)) {
    return NextResponse.redirect(new URL("/?error=invalid_link", req.nextUrl.origin))
  }

  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()

  const { error } = await supabase.auth.verifyOtp({ token_hash, type: type as EmailOtpType })

  if (error) {
    return NextResponse.redirect(new URL("/?error=link_expired", req.nextUrl.origin))
  }

  return NextResponse.redirect(new URL("/activate", req.nextUrl.origin))
}
