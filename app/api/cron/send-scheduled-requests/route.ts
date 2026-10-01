import { timingSafeEqual } from "crypto"
import { revalidatePath } from "next/cache"
import { NextResponse } from "next/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { intentionsService } from "@/services/intentions/intentions.service"

// Called by a scheduled job (cron) — protected by the same shared secret as /api/reminders
export async function POST(request: Request) {
  const secret = request.headers.get("x-cron-secret")
  const expected = process.env.CRON_SECRET ?? ""
  const secretOk =
    expected.length > 0 &&
    secret !== null &&
    secret.length === expected.length &&
    timingSafeEqual(Buffer.from(secret), Buffer.from(expected))
  if (!secretOk) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
  }

  try {
    const result = await intentionsService.sendDueScheduled(createSupabaseAdminClient())
    if (result.sent > 0) revalidatePath("/requests")
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error"
    return NextResponse.json({ message }, { status: 500 })
  }
}
