import { timingSafeEqual } from "crypto"
import { NextResponse } from "next/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { notifyPendingComments } from "@/services/intentions/comment-notifications.service"
import { settingsService } from "@/services/settings/settings.service"

// Called by a scheduled job (cron) — protected by a shared secret
export async function POST(request: Request) {
  const secret = request.headers.get("x-cron-secret")
  const expected = process.env.CRON_SECRET ?? ""
  const secretOk =
    secret !== null &&
    secret.length === expected.length &&
    timingSafeEqual(Buffer.from(secret), Buffer.from(expected))
  if (!secretOk) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
  }

  try {
    const admin = createSupabaseAdminClient()
    const settings = await settingsService.getAll(admin)
    const summary = await notifyPendingComments(admin, {
      treasuryEmail: settings.tesoreria_notification_email
    })
    return NextResponse.json({ ok: true, summary })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error"
    return NextResponse.json({ message }, { status: 500 })
  }
}
