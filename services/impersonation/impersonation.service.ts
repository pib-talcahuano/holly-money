import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { USER_ROLES, hasRole } from "@/lib/constants/roles"

const SESSION_TTL_MS = 30 * 60 * 1000

export type ImpersonationSession = {
  id: string
  impersonator_id: string
  target_user_id: string
  started_at: string
  expires_at: string
}

export const impersonationService = {
  async start(impersonatorId: string, targetUserId: string): Promise<ImpersonationSession> {
    if (targetUserId === impersonatorId) {
      throw new Error("No puedes suplantar tu propia cuenta")
    }

    const admin = createSupabaseAdminClient()

    const { data: target, error: targetError } = await admin
      .from("users")
      .select("id, full_name, email, roles, status")
      .eq("id", targetUserId)
      .single()

    if (targetError || !target) throw new Error("Usuario no encontrado")
    if (target.status !== "ACTIVE") {
      throw new Error("Solo se puede suplantar a un usuario activo")
    }
    if (hasRole(target, USER_ROLES.ADMIN)) {
      throw new Error("No se puede suplantar a otro administrador")
    }

    const { data: existing } = await admin
      .from("impersonation_sessions")
      .select("id")
      .eq("impersonator_id", impersonatorId)
      .is("ended_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle()

    if (existing) {
      throw new Error(
        "Ya tienes una sesión de suplantación activa. Ciérrala antes de iniciar otra."
      )
    }

    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString()

    const { data: session, error } = await admin
      .from("impersonation_sessions")
      .insert({
        impersonator_id: impersonatorId,
        target_user_id: targetUserId,
        expires_at: expiresAt
      })
      .select("id, impersonator_id, target_user_id, started_at, expires_at")
      .single()

    if (error || !session) throw error ?? new Error("No se pudo iniciar la suplantación")

    return session
  },

  async stop(
    sessionId: string,
    reason: "manual" | "expired" | "target_inactive" | "forced" = "manual"
  ): Promise<void> {
    const admin = createSupabaseAdminClient()

    const { data: session } = await admin
      .from("impersonation_sessions")
      .select("id")
      .eq("id", sessionId)
      .is("ended_at", null)
      .maybeSingle()

    if (!session) return

    await admin
      .from("impersonation_sessions")
      .update({ ended_at: new Date().toISOString(), ended_reason: reason })
      .eq("id", sessionId)
  }
}
