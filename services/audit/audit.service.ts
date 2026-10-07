import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { getCurrentUser } from "@/lib/supabase/server"

type LogSystemInput = {
  entity: string
  action: string
  user_id: string
  entity_id?: string | null
  previous_value?: unknown
  new_value?: unknown
  note?: string | null
  impersonator_id?: string | null
}

type LogMovementInput = {
  movement_id: string
  action: string
  user_id: string
  previous_value?: unknown
  new_value?: unknown
  note?: string | null
  impersonator_id?: string | null
}

async function resolveImpersonatorId(explicit?: string | null) {
  if (explicit !== undefined) return explicit
  const current = await getCurrentUser()
  return current?.impersonatorId ?? null
}

export const auditService = {
  async logSystem(input: LogSystemInput) {
    const admin = createSupabaseAdminClient()
    return admin.from("system_audit_log").insert({
      entity: input.entity,
      action: input.action,
      entity_id: input.entity_id ?? null,
      user_id: input.user_id,
      impersonator_id: await resolveImpersonatorId(input.impersonator_id),
      previous_value: (input.previous_value ?? null) as Parameters<
        typeof admin.from
      >[0] extends never
        ? never
        : unknown,
      new_value: (input.new_value ?? null) as Parameters<typeof admin.from>[0] extends never
        ? never
        : unknown,
      note: input.note ?? null
    })
  },

  async logMovement(input: LogMovementInput) {
    const admin = createSupabaseAdminClient()
    return admin.from("movement_audit_log").insert({
      movement_id: input.movement_id,
      action: input.action,
      user_id: input.user_id,
      impersonator_id: await resolveImpersonatorId(input.impersonator_id),
      previous_value: (input.previous_value ?? null) as Parameters<
        typeof admin.from
      >[0] extends never
        ? never
        : unknown,
      new_value: (input.new_value ?? null) as Parameters<typeof admin.from>[0] extends never
        ? never
        : unknown,
      note: input.note ?? null
    })
  },

  async listSystem(limit = 80) {
    const admin = createSupabaseAdminClient()
    const { data, error } = await admin
      .from("system_audit_log")
      .select(
        "*, users!system_audit_log_user_id_fkey(id, full_name, email, roles), impersonator:users!system_audit_log_impersonator_id_fkey(id, full_name, email, roles)"
      )
      .order("event_date", { ascending: false })
      .limit(limit)

    if (error) throw error
    return data
  }
}
