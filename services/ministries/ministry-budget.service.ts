import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database.types"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { auditService } from "@/services/audit/audit.service"
import type {
  UpsertBudgetPeriodInput,
  UpsertMinistryBudgetInput
} from "@/lib/validators/ministry-budget"

type DB = SupabaseClient<Database>

export type MinistryBudgetSummaryRow = {
  ministry_id: string
  ministry_name: string
  period_id: string
  period_label: string
  period_start_date: string
  period_end_date: string
  assigned_amount: number
  initial_used_amount: number
  used_amount: number
  remaining: number
}

export const ministryBudgetService = {
  async listPeriods(db: DB) {
    const { data, error } = await db
      .from("budget_periods")
      .select("*")
      .order("start_date", { ascending: false })
    if (error) throw error
    return data
  },

  async getCurrentPeriod(db: DB) {
    const today = new Date().toISOString().slice(0, 10)
    const { data, error } = await db
      .from("budget_periods")
      .select("*")
      .lte("start_date", today)
      .gte("end_date", today)
      .maybeSingle()
    if (error) throw error
    return data
  },

  async upsertPeriod(db: DB, input: UpsertBudgetPeriodInput, userId: string) {
    const { id, ...rest } = input

    if (id) {
      const { data, error } = await db
        .from("budget_periods")
        .update({ ...rest, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single()
      if (error) throw error

      await auditService.logSystem({
        entity: "MINISTRY_BUDGET_PERIOD",
        action: "BUDGET_PERIOD_UPDATED",
        user_id: userId,
        entity_id: data.id,
        new_value: rest
      })

      return data
    }

    const { data, error } = await db
      .from("budget_periods")
      .insert({ ...rest, created_by: userId })
      .select()
      .single()
    if (error) throw error

    await auditService.logSystem({
      entity: "MINISTRY_BUDGET_PERIOD",
      action: "BUDGET_PERIOD_CREATED",
      user_id: userId,
      entity_id: data.id,
      new_value: rest
    })

    return data
  },

  async upsertBudget(db: DB, input: UpsertMinistryBudgetInput, userId: string) {
    const { data, error } = await db
      .from("ministry_budgets")
      .upsert(
        {
          ministry_id: input.ministry_id,
          budget_period_id: input.budget_period_id,
          assigned_amount: input.assigned_amount,
          initial_used_amount: input.initial_used_amount,
          notes: input.notes ?? null,
          created_by: userId,
          updated_at: new Date().toISOString()
        },
        { onConflict: "ministry_id,budget_period_id" }
      )
      .select()
      .single()
    if (error) throw error

    await auditService.logSystem({
      entity: "MINISTRY_BUDGET",
      action: "MINISTRY_BUDGET_UPSERTED",
      user_id: userId,
      entity_id: data.id,
      new_value: input
    })

    return data
  },

  // SECURITY DEFINER RPC, solo invocable por service_role — mismo patrón que
  // ministry-leftover.service.ts. El filtrado por permiso/ministerio ocurre en
  // la capa de página/acción antes de llamar acá, no en el RPC.
  async getSummary(periodId?: string): Promise<MinistryBudgetSummaryRow[]> {
    const admin = createSupabaseAdminClient()
    const { data, error } = await admin.rpc("get_ministry_budget_summary", {
      p_period_id: periodId
    })
    if (error) throw error
    return (data ?? []) as unknown as MinistryBudgetSummaryRow[]
  }
}
