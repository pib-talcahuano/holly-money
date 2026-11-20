import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database.types"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { auditService } from "@/services/audit/audit.service"
import { assertExpenseCategory } from "@/services/ministries/budget-category"
import type {
  SetBudgetItemActiveInput,
  UpdateBudgetItemAmountsInput,
  UpsertBudgetItemInput
} from "@/lib/validators/budget-item"

type DB = SupabaseClient<Database>

export type BudgetItemSummaryRow = {
  item_id: string
  name: string
  category_id: string | null
  category_name: string | null
  notes: string | null
  assigned_amount: number
  initial_used_amount: number
  used_amount: number
  remaining: number
}

const UNIQUE_VIOLATION = "23505"

function rethrowFriendly(error: { code?: string; message?: string }): never {
  if (error.code === UNIQUE_VIOLATION) {
    throw new Error("Ya existe un ítem con ese nombre en este período")
  }
  throw error
}

export const budgetItemsService = {
  async upsertItem(db: DB, input: UpsertBudgetItemInput, userId: string) {
    const { id, ...rest } = input
    const values = { ...rest, category_id: rest.category_id ?? null, notes: rest.notes ?? null }

    if (values.category_id) await assertExpenseCategory(db, values.category_id)

    if (id) {
      const { data, error } = await db
        .from("budget_items")
        .update({ ...values, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single()
      if (error) rethrowFriendly(error)

      await auditService.logSystem({
        entity: "BUDGET_ITEM",
        action: "BUDGET_ITEM_UPDATED",
        user_id: userId,
        entity_id: data.id,
        new_value: values
      })
      return data
    }

    const { data, error } = await db
      .from("budget_items")
      .insert({ ...values, created_by: userId })
      .select()
      .single()
    if (error) rethrowFriendly(error)

    await auditService.logSystem({
      entity: "BUDGET_ITEM",
      action: "BUDGET_ITEM_CREATED",
      user_id: userId,
      entity_id: data.id,
      new_value: values
    })
    return data
  },

  async setActive(db: DB, input: SetBudgetItemActiveInput, userId: string) {
    const { data, error } = await db
      .from("budget_items")
      .update({ is_active: input.is_active, updated_at: new Date().toISOString() })
      .eq("id", input.id)
      .select()
      .single()
    if (error) rethrowFriendly(error)

    await auditService.logSystem({
      entity: "BUDGET_ITEM",
      action: input.is_active ? "BUDGET_ITEM_ACTIVATED" : "BUDGET_ITEM_DEACTIVATED",
      user_id: userId,
      entity_id: data.id,
      new_value: { is_active: input.is_active }
    })
    return data
  },

  // Amounts only: the table's "Guardar cambios" must never overwrite name, category or notes,
  // which change only through the dialog (upsertItem).
  async updateAmounts(db: DB, input: UpdateBudgetItemAmountsInput, userId: string) {
    const values = {
      assigned_amount: input.assigned_amount,
      initial_used_amount: input.initial_used_amount
    }
    const { data, error } = await db
      .from("budget_items")
      .update({ ...values, updated_at: new Date().toISOString() })
      .eq("id", input.id)
      .select()
      .single()
    if (error) throw error

    await auditService.logSystem({
      entity: "BUDGET_ITEM",
      action: "BUDGET_ITEM_AMOUNTS_UPDATED",
      user_id: userId,
      entity_id: data.id,
      new_value: values
    })
    return data
  },

  // SECURITY DEFINER RPC, solo invocable por service_role — mismo patrón que
  // ministryBudgetService.getSummary. El permiso se valida en la página/acción.
  async getSummary(periodId?: string): Promise<BudgetItemSummaryRow[]> {
    const admin = createSupabaseAdminClient()
    const { data, error } = await admin.rpc("get_budget_items_summary", {
      p_period_id: periodId
    })
    if (error) throw error
    return (data ?? []) as unknown as BudgetItemSummaryRow[]
  },

  async listExpenseCategories(db: DB): Promise<{ id: string; name: string }[]> {
    const { data, error } = await db
      .from("movement_categories")
      .select("id, name")
      .eq("movement_type", "EXPENSE")
      .eq("is_active", true)
      .order("name")
    if (error) throw error
    return data
  }
}
