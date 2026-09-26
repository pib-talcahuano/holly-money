import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { auditService } from "@/services/audit/audit.service"
import { sendInviteEmail, sendResetEmail } from "@/services/email/resend.service"
import { wrapAuthLink } from "@/services/auth/link-wrapper"
import { getSiteUrl } from "@/lib/utils"
import type { CreateUserInput, UpdateUserInput, UpdateOwnProfileInput } from "@/lib/validators/user"

export const usersService = {
  async getById(userId: string) {
    const admin = createSupabaseAdminClient()
    const { data, error } = await admin
      .from("users")
      .select("id, full_name, email, role, status, created_at, updated_at")
      .eq("id", userId)
      .single()

    if (error || !data) throw new Error("Usuario no encontrado")
    return data
  },

  async list() {
    const admin = createSupabaseAdminClient()
    const { data, error } = await admin
      .from("users")
      .select("id, full_name, email, role, status, created_at, updated_at")
      .order("created_at", { ascending: true })
      .limit(500)

    if (error) throw error
    return data
  },

  async invite(input: CreateUserInput, actingUserId: string) {
    const admin = createSupabaseAdminClient()
    const email = input.email.toLowerCase().trim()
    const callbackUrl = `${getSiteUrl()}/auth/callback`

    const { data: existing } = await admin
      .from("users")
      .select("status")
      .eq("email", email)
      .maybeSingle()
    if (existing) {
      if (existing.status === "PENDING_ACTIVATION") {
        throw new Error(
          "Este correo ya tiene una invitación pendiente. Usa la opción 'Reenviar invitación'."
        )
      }
      throw new Error("Ya existe un usuario registrado con este correo electrónico.")
    }

    // generateLink creates the auth.users record and returns the invite link
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: {
        redirectTo: callbackUrl,
        data: { full_name: input.full_name.trim() }
      }
    })

    if (linkError) {
      if (linkError.message.toLowerCase().includes("already been registered")) {
        throw new Error("Ya existe un usuario registrado con este correo electrónico.")
      }
      throw linkError
    }

    const userId = linkData.user.id

    // Insert into public.users with PENDING_ACTIVATION status
    const { error: insertError } = await admin.from("users").insert({
      id: userId,
      full_name: input.full_name.trim(),
      email,
      role: input.role,
      status: "PENDING_ACTIVATION"
    })

    if (insertError) throw insertError

    const inviteLink = wrapAuthLink(linkData.properties.action_link)

    // Send invite email via Resend
    await sendInviteEmail({
      to: email,
      full_name: input.full_name.trim(),
      action_link: inviteLink
    })

    await auditService.logSystem({
      entity: "users",
      action: "Usuario invitado",
      entity_id: userId,
      user_id: actingUserId,
      new_value: { email, full_name: input.full_name.trim(), role: input.role },
      note: "Invitación enviada, pendiente de activación"
    })

    const { data: profile } = await admin
      .from("users")
      .select("id, full_name, role, status, created_at, updated_at")
      .eq("id", userId)
      .single()

    return { ...profile, email, invite_link: inviteLink }
  },

  async resetAccount(userId: string, actingUserId: string) {
    const admin = createSupabaseAdminClient()

    const { data: user, error: fetchError } = await admin
      .from("users")
      .select("id, full_name, status")
      .eq("id", userId)
      .single()

    if (fetchError || !user) throw new Error("Usuario no encontrado")

    const { data: authUserData } = await admin.auth.admin.getUserById(userId)
    if (!authUserData.user) throw new Error("Usuario de autenticación no encontrado")

    const email = authUserData.user.email!
    const callbackUrl = `${getSiteUrl()}/auth/callback`

    await admin
      .from("users")
      .update({ status: "PENDING_RESET", updated_at: new Date().toISOString() })
      .eq("id", userId)

    // Generate recovery link
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: callbackUrl }
    })

    if (linkError) throw linkError

    await sendResetEmail({
      to: email,
      full_name: user.full_name,
      action_link: wrapAuthLink(linkData.properties.action_link)
    })

    await auditService.logSystem({
      entity: "users",
      action: "Cuenta reseteada",
      entity_id: userId,
      user_id: actingUserId,
      previous_value: { status: user.status },
      new_value: { status: "PENDING_RESET" },
      note: "Restablecimiento de cuenta iniciado por administrador"
    })
  },

  async delete(userId: string, actingUserId: string) {
    if (userId === actingUserId) throw new Error("No puedes eliminar tu propia cuenta")

    const admin = createSupabaseAdminClient()

    const { data: user, error: fetchError } = await admin
      .from("users")
      .select("full_name, email, role, status")
      .eq("id", userId)
      .single()

    if (fetchError || !user) throw new Error("Usuario no encontrado")

    // Hard-deleting from auth.users cascades to public.users (ON DELETE CASCADE), but that row
    // is protected by ON DELETE RESTRICT/NO ACTION foreign keys from movements, audit logs,
    // intentions, settlements, payroll, etc. — so a hard delete fails for any user who has ever
    // done anything in the system. Soft delete keeps the auth.users row (invalidating sessions
    // and scrambling the login email) so those references stay valid, and we deactivate the
    // profile below to fully block access, consistent with the "no physical deletion" convention
    // used elsewhere (movements are cancelled, never deleted).
    const { error } = await admin.auth.admin.deleteUser(userId, true)
    if (error) throw error

    await admin
      .from("users")
      .update({ status: "INACTIVE", updated_at: new Date().toISOString() })
      .eq("id", userId)

    await auditService.logSystem({
      entity: "users",
      action: "Usuario eliminado",
      entity_id: userId,
      user_id: actingUserId,
      previous_value: user,
      note: "Usuario eliminado por administrador (cuenta desactivada, historial preservado)"
    })
  },

  async resendInvite(userId: string, actingUserId: string) {
    const admin = createSupabaseAdminClient()

    const { data: user, error: fetchError } = await admin
      .from("users")
      .select("id, full_name, status")
      .eq("id", userId)
      .single()

    if (fetchError || !user) throw new Error("Usuario no encontrado")
    if (user.status !== "PENDING_ACTIVATION")
      throw new Error("Solo se puede reenviar invitación a usuarios pendientes de activación")

    const { data: authUser } = await admin.auth.admin.getUserById(userId)
    if (!authUser.user) throw new Error("Usuario de autenticación no encontrado")

    const email = authUser.user.email!
    const callbackUrl = `${getSiteUrl()}/auth/callback`

    // Use magiclink instead of invite — Supabase rejects re-inviting an already-pending
    // (unconfirmed) user with a "already registered" error. Magiclink bypasses that
    // restriction, sets email_confirmed_at on use, and works with our verifyOtp flow.
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: callbackUrl }
    })

    if (linkError) throw linkError

    await admin.from("users").update({ updated_at: new Date().toISOString() }).eq("id", userId)

    const inviteLink = wrapAuthLink(linkData.properties.action_link)

    await sendInviteEmail({
      to: email,
      full_name: user.full_name,
      action_link: inviteLink
    })

    await auditService.logSystem({
      entity: "users",
      action: "Invitación reenviada",
      entity_id: userId,
      user_id: actingUserId,
      note: "Correo de invitación reenviado"
    })

    return { invite_link: inviteLink }
  },

  async update(input: UpdateUserInput, actingUserId: string) {
    const admin = createSupabaseAdminClient()

    const { data: current, error: fetchError } = await admin
      .from("users")
      .select()
      .eq("id", input.id)
      .single()

    if (fetchError || !current) throw new Error("Usuario no encontrado")

    const { data: updated, error } = await admin
      .from("users")
      .update({
        full_name: input.full_name.trim(),
        role: input.role,
        status: input.status,
        updated_at: new Date().toISOString()
      })
      .eq("id", input.id)
      .select("id, full_name, role, status, created_at, updated_at")
      .single()

    if (error) throw error

    await auditService.logSystem({
      entity: "users",
      action: "Usuario actualizado",
      entity_id: input.id,
      user_id: actingUserId,
      previous_value: current,
      new_value: updated,
      note: "Información del usuario actualizada"
    })

    return updated
  },

  async updateOwnProfile(input: UpdateOwnProfileInput, userId: string) {
    const admin = createSupabaseAdminClient()

    const { data: current, error: fetchError } = await admin
      .from("users")
      .select("id, full_name")
      .eq("id", userId)
      .single()

    if (fetchError || !current) throw new Error("Usuario no encontrado")

    const full_name = input.full_name.trim()
    const { data: updated, error } = await admin
      .from("users")
      .update({ full_name, updated_at: new Date().toISOString() })
      .eq("id", userId)
      .select("id, full_name")
      .single()

    if (error) throw error

    await auditService.logSystem({
      entity: "users",
      action: "Usuario actualizado",
      entity_id: userId,
      user_id: userId,
      previous_value: current,
      new_value: updated,
      note: "Perfil propio actualizado"
    })

    return updated
  }
}
