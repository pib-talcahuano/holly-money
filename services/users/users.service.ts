import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { auditService } from "@/services/audit/audit.service"
import { sendInviteEmail, sendResetEmail } from "@/services/email/resend.service"
import { wrapAuthLink } from "@/services/auth/link-wrapper"
import { attachmentStorageService } from "@/services/storage/attachment-storage.service"
import { getSiteUrl } from "@/lib/utils"
import { USER_ROLES, normalizeRoles } from "@/lib/constants/roles"
import type { UserRole } from "@/types/auth"
import type { CreateUserInput, UpdateUserInput, UpdateOwnProfileInput } from "@/lib/validators/user"

export type UserPurgePreview = {
  counts: Record<string, number>
  foreign_reach: { movements: number; transfers: number; settlements: number }
  storage_paths: string[]
}

async function runPurge(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  userId: string,
  dryRun: boolean
): Promise<UserPurgePreview> {
  const { data, error } = await admin.rpc("purge_user", {
    p_user_id: userId,
    p_dry_run: dryRun
  })
  if (error || !data) {
    console.error("purge_user failed", { userId, dryRun, message: error?.message })
    throw new Error(
      dryRun
        ? "No se pudo calcular los registros a eliminar"
        : "No se pudo eliminar permanentemente el usuario. No se realizaron cambios."
    )
  }
  return data as unknown as UserPurgePreview
}

// `invite` is also called by the ministries flow with ["DELEGATE"], which the users-dialog
// schema deliberately doesn't allow — so the service takes plain roles, not CreateUserInput.
export type InviteUserInput = Pick<CreateUserInput, "full_name" | "email"> & {
  roles: UserRole[]
}

export const usersService = {
  async getById(userId: string) {
    const admin = createSupabaseAdminClient()
    const { data, error } = await admin
      .from("users")
      .select("id, full_name, email, roles, status, created_at, updated_at")
      .eq("id", userId)
      .single()

    if (error || !data) throw new Error("Usuario no encontrado")
    return data
  },

  async list() {
    const admin = createSupabaseAdminClient()
    const { data, error } = await admin
      .from("users")
      .select("id, full_name, email, roles, status, created_at, updated_at")
      .order("created_at", { ascending: true })
      .limit(500)

    if (error) throw error
    return data
  },

  async invite(input: InviteUserInput, actingUserId: string) {
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
      roles: normalizeRoles(input.roles),
      status: "PENDING_ACTIVATION"
    })

    if (insertError) throw insertError

    const inviteLink = wrapAuthLink(linkData.properties.action_link, linkData.user.email ?? email)

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
      new_value: { email, full_name: input.full_name.trim(), roles: normalizeRoles(input.roles) },
      note: "Invitación enviada, pendiente de activación"
    })

    const { data: profile } = await admin
      .from("users")
      .select("id, full_name, roles, status, created_at, updated_at")
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
      action_link: wrapAuthLink(linkData.properties.action_link, linkData.user.email ?? email)
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

  async delete(userId: string, actingUserId: string, options?: { hardDelete?: boolean }) {
    if (userId === actingUserId) throw new Error("No puedes eliminar tu propia cuenta")

    const admin = createSupabaseAdminClient()

    const { data: user, error: fetchError } = await admin
      .from("users")
      .select("full_name, email, roles, status")
      .eq("id", userId)
      .single()

    if (fetchError || !user) throw new Error("Usuario no encontrado")

    const hardDelete = options?.hardDelete ?? false

    let purge: UserPurgePreview | null = null
    if (hardDelete) {
      // purge_user deletes everything tied to the user (movements, intentions, settlements,
      // payroll, audit rows...) and the auth.users row in one transaction. Never surface the raw
      // driver error to the caller: it isn't guaranteed to be serializable and, unhandled, broke
      // the delete flow entirely before this was caught.
      purge = await runPurge(admin, userId, false)
      // Storage objects can't be removed from SQL. The DB is already committed, so a failure here
      // only leaves orphaned files: log it instead of reporting the delete as failed.
      try {
        await attachmentStorageService.removeMany(purge.storage_paths)
      } catch (error) {
        console.error("Purge: failed to remove storage objects", { userId, error })
      }
    } else {
      // Soft delete keeps the auth.users row (invalidating sessions and scrambling the login
      // email) so those references stay valid, and we deactivate the profile below to fully
      // block access, consistent with the "no physical deletion" convention used elsewhere
      // (movements are cancelled, never deleted).
      const { error } = await admin.auth.admin.deleteUser(userId, true)
      if (error) throw error

      await admin
        .from("users")
        .update({ status: "INACTIVE", updated_at: new Date().toISOString() })
        .eq("id", userId)
    }

    await auditService.logSystem({
      entity: "users",
      action: hardDelete ? "Usuario eliminado permanentemente" : "Usuario eliminado",
      entity_id: userId,
      user_id: actingUserId,
      previous_value: user,
      new_value: purge ? { counts: purge.counts, foreign_reach: purge.foreign_reach } : undefined,
      note: hardDelete
        ? "Usuario y todos sus registros eliminados permanentemente por administrador"
        : "Usuario eliminado por administrador (cuenta desactivada, historial preservado)"
    })
  },

  async previewPurge(userId: string, actingUserId: string): Promise<UserPurgePreview> {
    if (userId === actingUserId) throw new Error("No puedes eliminar tu propia cuenta")
    return runPurge(createSupabaseAdminClient(), userId, true)
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

    const inviteLink = wrapAuthLink(linkData.properties.action_link, linkData.user.email ?? email)

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

    const currentRoles = current.roles as UserRole[]
    const nextRoles = normalizeRoles(input.roles)
    const currentIsDelegate = currentRoles.includes(USER_ROLES.DELEGATE)
    if (currentIsDelegate && nextRoles.join() !== normalizeRoles(currentRoles).join()) {
      throw new Error("El rol de un delegado no se puede modificar")
    }
    if (!currentIsDelegate && nextRoles.includes(USER_ROLES.DELEGATE)) {
      throw new Error("El rol de delegado solo se asigna desde Ministerios")
    }

    const { data: updated, error } = await admin
      .from("users")
      .update({
        full_name: input.full_name.trim(),
        roles: nextRoles,
        status: input.status,
        updated_at: new Date().toISOString()
      })
      .eq("id", input.id)
      .select("id, full_name, roles, status, created_at, updated_at")
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
