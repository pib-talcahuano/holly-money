import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database.types"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { auditService } from "@/services/audit/audit.service"
import { assertExpenseCategory } from "@/services/ministries/budget-category"
import type { SetSubItemActiveInput, UpsertSubItemInput } from "@/lib/validators/budget-sub-item"

type DB = SupabaseClient<Database>

export type SubItemParent = { ministry_budget_id: string } | { budget_item_id: string }

export type BudgetSubItemSummaryRow = {
  sub_item_id: string
  parent_type: "MINISTRY" | "ITEM"
  ministry_id: string | null
  budget_item_id: string | null
  name: string
  assigned_amount: number
  used_amount: number
  remaining: number
}

const UNIQUE_VIOLATION = "23505"

function rethrowFriendly(error: { code?: string; message?: string }): never {
  if (error.code === UNIQUE_VIOLATION) {
    if (error.message?.includes("budget_sub_items_item_category_unique")) {
      throw new Error("Esa categoría ya está vinculada a otro sub-ítem de este ítem")
    }
    throw new Error("Ya existe un sub-ítem con ese nombre")
  }
  throw error
}

export const budgetSubItemsService = {
  async upsert(db: DB, input: UpsertSubItemInput, userId: string) {
    const { id, ...rest } = input
    const values = {
      ...rest,
      ministry_budget_id: rest.ministry_budget_id ?? null,
      budget_item_id: rest.budget_item_id ?? null,
      category_id: rest.category_id ?? null,
      notes: rest.notes ?? null
    }

    // On update the stored parent is authoritative: reparenting is not allowed, so the
    // category rule is checked against it and the parent columns are never written.
    let isMinistryParent = values.ministry_budget_id !== null
    if (id) {
      const { data: stored, error: storedError } = await db
        .from("budget_sub_items")
        .select("ministry_budget_id")
        .eq("id", id)
        .maybeSingle()
      if (storedError) throw storedError
      if (!stored) throw new Error("Sub-ítem no encontrado")
      isMinistryParent = stored.ministry_budget_id !== null
    }

    if (values.category_id) {
      if (isMinistryParent) {
        throw new Error("Los sub-ítems de ministerio no pueden tener categoría")
      }
      await assertExpenseCategory(db, values.category_id)
    }

    if (id) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { ministry_budget_id, budget_item_id, ...updatable } = values
      const { data, error } = await db
        .from("budget_sub_items")
        .update({ ...updatable, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single()
      if (error) rethrowFriendly(error)

      await auditService.logSystem({
        entity: "BUDGET_SUB_ITEM",
        action: "BUDGET_SUB_ITEM_UPDATED",
        user_id: userId,
        entity_id: data.id,
        new_value: updatable
      })
      return data
    }

    const { data, error } = await db
      .from("budget_sub_items")
      .insert({ ...values, created_by: userId })
      .select()
      .single()
    if (error) rethrowFriendly(error)

    await auditService.logSystem({
      entity: "BUDGET_SUB_ITEM",
      action: "BUDGET_SUB_ITEM_CREATED",
      user_id: userId,
      entity_id: data.id,
      new_value: values
    })
    return data
  },

  async setActive(db: DB, input: SetSubItemActiveInput, userId: string) {
    const { data, error } = await db
      .from("budget_sub_items")
      .update({ is_active: input.is_active, updated_at: new Date().toISOString() })
      .eq("id", input.id)
      .select()
      .single()
    if (error) rethrowFriendly(error)

    await auditService.logSystem({
      entity: "BUDGET_SUB_ITEM",
      action: input.is_active ? "BUDGET_SUB_ITEM_UPDATED" : "BUDGET_SUB_ITEM_DEACTIVATED",
      user_id: userId,
      entity_id: data.id,
      new_value: { is_active: input.is_active }
    })
    return data
  },

  async list(db: DB, parent: SubItemParent) {
    const query = db.from("budget_sub_items").select("*").eq("is_active", true).order("name")
    const { data, error } =
      "ministry_budget_id" in parent
        ? await query.eq("ministry_budget_id", parent.ministry_budget_id)
        : await query.eq("budget_item_id", parent.budget_item_id)
    if (error) throw error
    return data
  },

  // Admin client: the RPC is service_role-only. Permission is checked by the page/action.
  async getSummary(periodId?: string): Promise<BudgetSubItemSummaryRow[]> {
    const admin = createSupabaseAdminClient()
    const { data, error } = await admin.rpc("get_budget_sub_items_summary", {
      p_period_id: periodId
    })
    if (error) throw error
    return (data ?? []) as unknown as BudgetSubItemSummaryRow[]
  }
}
