"use server"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { sendForgotPasswordEmail } from "@/services/email/resend.service"
import { wrapAuthLink } from "@/services/auth/link-wrapper"
import { getSiteUrl } from "@/lib/utils"

export async function activateAccount() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error("No autenticado")
  }

  const admin = createSupabaseAdminClient()
  await admin
    .from("users")
    .update({ status: "ACTIVE", updated_at: new Date().toISOString() })
    .eq("id", user.id)
}

export async function sendForgotPassword(email: string) {
  const normalizedEmail = email.toLowerCase().trim()

  const admin = createSupabaseAdminClient()

  const { data: authUsers } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const authUser = authUsers.users.find((u) => u.email === normalizedEmail) ?? null

  if (!authUser) return

  const { data: profile } = await admin
    .from("users")
    .select("status")
    .eq("id", authUser.id)
    .single()

  if (!profile || profile.status === "INACTIVE") return

  const callbackUrl = `${getSiteUrl()}/auth/callback`
  const { data: linkData, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: normalizedEmail,
    options: { redirectTo: callbackUrl }
  })

  if (error) return

  await admin
    .from("users")
    .update({ status: "PENDING_RESET", updated_at: new Date().toISOString() })
    .eq("id", authUser.id)

  await sendForgotPasswordEmail({
    to: normalizedEmail,
    action_link: wrapAuthLink(linkData.properties.action_link, normalizedEmail)
  })
}
