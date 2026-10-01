import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database.types"
import { auditService } from "@/services/audit/audit.service"
import { usersService } from "@/services/users/users.service"
import type {
  CreateMinistryInput,
  UpdateMinistryInput,
  AssignMinisterInput,
  InviteDelegateInput
} from "@/lib/validators/ministry"

type DB = SupabaseClient<Database>

export const ministriesService = {
  async list(db: DB) {
    const { data, error } = await db.from("ministries").select("*").order("name").limit(500)
    if (error) throw error
    return data
  },

  async getById(db: DB, id: string) {
    const { data, error } = await db
      .from("ministries")
      .select("*, created_by_user:users!ministries_created_by_fkey(full_name)")
      .eq("id", id)
      .single()
    if (error) throw error
    return data
  },

  async create(db: DB, input: CreateMinistryInput, userId: string) {
    const { data, error } = await db
      .from("ministries")
      .insert({
        name: input.name,
        description: input.description ?? null,
        created_by: userId
      })
      .select()
      .single()
    if (error) throw error

    await auditService.logSystem({
      entity: "MINISTRY",
      action: "MINISTRY_CREATED",
      user_id: userId,
      entity_id: data.id,
      new_value: { name: data.name }
    })

    return data
  },

  async update(db: DB, id: string, input: UpdateMinistryInput, userId: string) {
    const { data, error } = await db
      .from("ministries")
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single()
    if (error) throw error

    await auditService.logSystem({
      entity: "MINISTRY",
      action: "MINISTRY_UPDATED",
      user_id: userId,
      entity_id: id,
      new_value: input
    })

    return data
  },

  async listCurrentAssignments(db: DB) {
    const { data, error } = await db
      .from("ministry_assignments")
      .select("id, ministry_id, user_id, assigned_at, users!user_id(id, full_name, email)")
      .is("unassigned_at", null)
    if (error) throw error
    return data
  },

  async getAssignments(db: DB, ministryId: string) {
    const { data, error } = await db
      .from("ministry_assignments")
      .select("*, users!user_id(id, full_name, email)")
      .eq("ministry_id", ministryId)
      .order("assigned_at", { ascending: false })
    if (error) throw error
    return data
  },

  async getCurrentAssignment(db: DB, ministryId: string) {
    const { data, error } = await db
      .from("ministry_assignments")
      .select("*, users!user_id(id, full_name, email)")
      .eq("ministry_id", ministryId)
      .is("unassigned_at", null)
      .maybeSingle()
    if (error) throw error
    return data
  },

  // Resolves the ministry a MINISTER or DELEGATE acts for. Checked in that order —
  // a person is never both for the same ministry (delegates get their own account,
  // see inviteDelegate) — falling back to ministry_delegates keeps every existing
  // caller (requests page/actions, ministry detail access gate) working for
  // delegates with no extra code, since they all key off this one lookup.
  async getMinistryForUser(db: DB, userId: string) {
    const { data, error } = await db
      .from("ministry_assignments")
      .select("*, ministries(*)")
      .eq("user_id", userId)
      .is("unassigned_at", null)
      .maybeSingle()
    if (error) throw error
    if (data) return data

    const { data: delegate, error: delegateError } = await db
      .from("ministry_delegates")
      .select("*, ministries(*)")
      .eq("user_id", userId)
      .maybeSingle()
    if (delegateError) throw delegateError
    return delegate
  },

  async listDelegates(db: DB, ministryId: string) {
    const { data, error } = await db
      .from("ministry_delegates")
      .select("id, user_id, created_at, users!user_id(id, full_name, email)")
      .eq("ministry_id", ministryId)
      .order("created_at", { ascending: false })
    if (error) throw error
    return data
  },

  async removeDelegate(db: DB, delegateId: string, userId: string) {
    const { data: delegate, error: fetchError } = await db
      .from("ministry_delegates")
      .select("id, ministry_id, user_id")
      .eq("id", delegateId)
      .single()
    if (fetchError) throw fetchError

    const { error } = await db.from("ministry_delegates").delete().eq("id", delegateId)
    if (error) throw error

    await auditService.logSystem({
      entity: "MINISTRY_DELEGATE",
      action: "DELEGATE_REMOVED",
      user_id: userId,
      entity_id: delegate.ministry_id,
      new_value: { ministry_id: delegate.ministry_id, user_id: delegate.user_id }
    })
  },

  // Creates the delegate's user account (role DELEGATE, invite email via
  // usersService.invite) and links them to the ministry in one call. If linking
  // fails after the account was created, the user still exists but unlinked —
  // acceptable here since account creation is the step far more likely to fail
  // (duplicate email), and an orphaned account is harmless (see removeDelegate).
  async inviteDelegate(
    db: DB,
    ministryId: string,
    input: InviteDelegateInput,
    assignedBy: string
  ) {
    const created = await usersService.invite(
      { full_name: input.full_name, email: input.email, roles: ["DELEGATE"] },
      assignedBy
    )
    if (!created.id) throw new Error("No se pudo crear la cuenta del delegado")

    const { data, error } = await db
      .from("ministry_delegates")
      .insert({ ministry_id: ministryId, user_id: created.id, assigned_by: assignedBy })
      .select("id, user_id, created_at, users!user_id(id, full_name, email)")
      .single()
    if (error) throw error

    await auditService.logSystem({
      entity: "MINISTRY_DELEGATE",
      action: "DELEGATE_ASSIGNED",
      user_id: assignedBy,
      entity_id: ministryId,
      new_value: { ministry_id: ministryId, user_id: created.id }
    })

    return data
  },

  async assign(db: DB, ministryId: string, input: AssignMinisterInput, assignedBy: string) {
    // Only users holding the MINISTER role (alone or alongside others, e.g. BURSAR) can be
    // assigned — the picker already filters, this guards direct calls.
    const { data: assignee } = await db
      .from("users")
      .select("roles, status")
      .eq("id", input.user_id)
      .single()
    if (!assignee || assignee.status !== "ACTIVE" || !assignee.roles.includes("MINISTER")) {
      throw new Error("El usuario seleccionado no tiene el rol de Ministro")
    }

    // Close any existing active assignment
    await db
      .from("ministry_assignments")
      .update({ unassigned_at: new Date().toISOString() })
      .eq("ministry_id", ministryId)
      .is("unassigned_at", null)

    const { data, error } = await db
      .from("ministry_assignments")
      .insert({
        ministry_id: ministryId,
        user_id: input.user_id,
        assigned_by: assignedBy,
        notes: input.notes ?? null
      })
      .select()
      .single()
    if (error) throw error

    await auditService.logSystem({
      entity: "MINISTRY_ASSIGNMENT",
      action: "MINISTER_ASSIGNED",
      user_id: assignedBy,
      entity_id: ministryId,
      new_value: { user_id: input.user_id, ministry_id: ministryId }
    })

    return data
  },

  async unassign(db: DB, ministryId: string, userId: string) {
    const { error } = await db
      .from("ministry_assignments")
      .update({ unassigned_at: new Date().toISOString() })
      .eq("ministry_id", ministryId)
      .is("unassigned_at", null)
    if (error) throw error

    await auditService.logSystem({
      entity: "MINISTRY_ASSIGNMENT",
      action: "MINISTER_UNASSIGNED",
      user_id: userId,
      entity_id: ministryId,
      new_value: { ministry_id: ministryId }
    })
  },

  // A movement isn't tagged with a ministry directly — it's reached through the
  // intention it was created from (registering a transfer or approving a
  // settlement each create exactly one movement). Two queries: intentions for
  // this ministry, then the movements those intentions' transfers/settlements
  // point at.
  async getAssociatedMovements(db: DB, ministryId: string) {
    const { data: intentions, error: intentionsError } = await db
      .from("budget_intentions")
      .select("id")
      .eq("ministry_id", ministryId)
    if (intentionsError) throw intentionsError

    const intentionIds = (intentions ?? []).map((i) => i.id)
    if (intentionIds.length === 0) return []

    const [{ data: transfers, error: transfersError }, { data: settlements, error: settlementsError }] =
      await Promise.all([
        db
          .from("intention_transfers")
          .select("movement_id")
          .in("intention_id", intentionIds)
          .not("movement_id", "is", null),
        db
          .from("expense_settlements")
          .select("movement_id")
          .in("intention_id", intentionIds)
          .not("movement_id", "is", null)
      ])
    if (transfersError) throw transfersError
    if (settlementsError) throw settlementsError

    const movementIds = [
      ...(transfers ?? []).map((t) => t.movement_id),
      ...(settlements ?? []).map((s) => s.movement_id)
    ].filter((id): id is string => !!id)
    if (movementIds.length === 0) return []

    const { data: movements, error: movementsError } = await db
      .from("movements")
      .select(
        "id, movement_date, amount, movement_categories(name), created_by:users!movements_created_by_id_fkey(full_name)"
      )
      .in("id", movementIds)
      .order("movement_date", { ascending: false })
    if (movementsError) throw movementsError
    return movements ?? []
  }
}
