import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database.types"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { auditService } from "@/services/audit/audit.service"
import { budgetPeriodRange } from "@/lib/utils/budget-period"
import type { UpsertMinistryBudgetInput } from "@/lib/validators/ministry-budget"

type DB = SupabaseClient<Database>

type Tables = Database["public"]["Tables"]
type MinistryBudgetRow = Tables["ministry_budgets"]["Row"]
type BudgetItemRow = Tables["budget_items"]["Row"]
type SubItemRow = Tables["budget_sub_items"]["Row"]

export type CopyScope =
  "ALL" | { ministry_id: string } | { budget_item_id: string } | { sub_item_id: string }

export type CopyCounts = { ministry_budgets: number; budget_items: number; sub_items: number }
export type CopyResult = { copied: CopyCounts; skipped: CopyCounts }

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
  // Spend of requests with no fund (sub-item) assigned; already included in used_amount.
  unassigned_used: number
  remaining: number
}

export const ministryBudgetService = {
  async listPeriods(db: DB) {
    const { data, error } = await db
      .from("budget_periods")
      .select("*")
      .order("year", { ascending: false })
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

  // Ids of the ministry_budgets rows of a period, so sub-items can be attached to them.
  async listBudgetIds(db: DB, periodId: string) {
    const { data, error } = await db
      .from("ministry_budgets")
      .select("id, ministry_id")
      .eq("budget_period_id", periodId)
    if (error) throw error
    return data
  },

  async createPeriodForYear(db: DB, year: number, userId: string) {
    const values = { year, label: `Presupuesto ${year}`, ...budgetPeriodRange(year) }
    const { data, error } = await db
      .from("budget_periods")
      .insert({ ...values, created_by: userId })
      .select()
      .single()
    if (error) {
      if (error.code === "23505") throw new Error("Ya existe un presupuesto para ese año")
      throw error
    }

    await auditService.logSystem({
      entity: "MINISTRY_BUDGET_PERIOD",
      action: "BUDGET_PERIOD_CREATED",
      user_id: userId,
      entity_id: data.id,
      new_value: values
    })

    return data
  },

  async upsertBudget(db: DB, input: UpsertMinistryBudgetInput, userId: string) {
    const { assigned_amount } = input
    // No assigned amount = a parent whose total is the sum of its sub-items: only the initial
    // used amount changes and the stored assigned amount stays intact.
    const { data, error } =
      assigned_amount === undefined
        ? await db
            .from("ministry_budgets")
            .update({
              initial_used_amount: input.initial_used_amount,
              updated_at: new Date().toISOString()
            })
            .eq("ministry_id", input.ministry_id)
            .eq("budget_period_id", input.budget_period_id)
            .select()
            .single()
        : await db
            .from("ministry_budgets")
            .upsert(
              {
                ministry_id: input.ministry_id,
                budget_period_id: input.budget_period_id,
                assigned_amount,
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
  },

  // Copies budget rows from one period into another. The source is only ever read. Nothing is
  // wrapped in a transaction: the copy is idempotent (existing rows in the target are skipped),
  // so a partial failure is recovered by simply running it again.
  async copyFromPeriod(
    db: DB,
    input: { from_period_id: string; to_period_id: string; scope: CopyScope },
    userId: string
  ): Promise<CopyResult> {
    const { from_period_id, to_period_id, scope } = input
    if (from_period_id === to_period_id) {
      throw new Error("El período de origen y destino deben ser distintos")
    }

    const copied: CopyCounts = { ministry_budgets: 0, budget_items: 0, sub_items: 0 }
    const skipped: CopyCounts = { ministry_budgets: 0, budget_items: 0, sub_items: 0 }

    // ── 1. What to copy, read from the source period ──
    let srcBudgets: MinistryBudgetRow[] = []
    let srcItems: BudgetItemRow[] = []
    let srcSubs: SubItemRow[] = []
    // A single sub-item is copied under a parent created empty (amount 0) when missing.
    const zeroParents = scope !== "ALL" && "sub_item_id" in scope

    const readBudgets = async (ministryId?: string) => {
      let q = db.from("ministry_budgets").select("*").eq("budget_period_id", from_period_id)
      if (ministryId) q = q.eq("ministry_id", ministryId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as MinistryBudgetRow[]
    }
    const readItems = async (itemId?: string) => {
      let q = db
        .from("budget_items")
        .select("*")
        .eq("budget_period_id", from_period_id)
        .eq("is_active", true)
      if (itemId) q = q.eq("id", itemId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as BudgetItemRow[]
    }

    if (scope === "ALL") {
      srcBudgets = await readBudgets()
      srcItems = await readItems()
    } else if ("ministry_id" in scope) {
      srcBudgets = await readBudgets(scope.ministry_id)
    } else if ("budget_item_id" in scope) {
      srcItems = await readItems(scope.budget_item_id)
    } else {
      const { data, error } = await db
        .from("budget_sub_items")
        .select("*")
        .eq("id", scope.sub_item_id)
        .eq("is_active", true)
        .maybeSingle()
      if (error) throw error
      if (!data) throw new Error("Sub-ítem no encontrado")
      const sub = data as SubItemRow
      if (sub.ministry_budget_id) {
        const { data: parent, error: parentError } = await db
          .from("ministry_budgets")
          .select("*")
          .eq("id", sub.ministry_budget_id)
          .eq("budget_period_id", from_period_id)
          .maybeSingle()
        if (parentError) throw parentError
        if (!parent) throw new Error("El sub-ítem no pertenece al período de origen")
        srcBudgets = [parent as MinistryBudgetRow]
      } else {
        const { data: parent, error: parentError } = await db
          .from("budget_items")
          .select("*")
          .eq("id", sub.budget_item_id as string)
          .eq("budget_period_id", from_period_id)
          .maybeSingle()
        if (parentError) throw parentError
        if (!parent) throw new Error("El sub-ítem no pertenece al período de origen")
        srcItems = [parent as BudgetItemRow]
      }
      srcSubs = [sub]
    }

    if (!zeroParents) {
      const readSubs = async (column: "ministry_budget_id" | "budget_item_id", ids: string[]) => {
        if (ids.length === 0) return []
        const { data, error } = await db
          .from("budget_sub_items")
          .select("*")
          .eq("is_active", true)
          .in(column, ids)
        if (error) throw error
        return (data ?? []) as SubItemRow[]
      }
      srcSubs = [
        ...(await readSubs(
          "ministry_budget_id",
          srcBudgets.map((b) => b.id)
        )),
        ...(await readSubs(
          "budget_item_id",
          srcItems.map((i) => i.id)
        ))
      ]
    }

    // ── 2. Parents: ministry budgets (by ministry) and items (by lower(name), active) ──
    const targetBudgetBySource = new Map<string, string>()
    if (srcBudgets.length > 0) {
      const { data, error } = await db
        .from("ministry_budgets")
        .select("id, ministry_id")
        .eq("budget_period_id", to_period_id)
      if (error) throw error
      const existing = new Map((data ?? []).map((b) => [b.ministry_id, b.id]))
      for (const src of srcBudgets) {
        const existingId = existing.get(src.ministry_id)
        if (existingId) {
          targetBudgetBySource.set(src.id, existingId)
          skipped.ministry_budgets++
          continue
        }
        const { data: created, error: insertError } = await db
          .from("ministry_budgets")
          .insert({
            ministry_id: src.ministry_id,
            budget_period_id: to_period_id,
            assigned_amount: zeroParents ? 0 : src.assigned_amount,
            initial_used_amount: 0,
            notes: zeroParents ? null : src.notes,
            created_by: userId
          })
          .select("id")
          .single()
        if (insertError) throw insertError
        targetBudgetBySource.set(src.id, created.id)
        copied.ministry_budgets++
      }
    }

    const targetItemBySource = new Map<string, string>()
    if (srcItems.length > 0) {
      const { data, error } = await db
        .from("budget_items")
        .select("id, name")
        .eq("budget_period_id", to_period_id)
        .eq("is_active", true)
      if (error) throw error
      const existing = new Map((data ?? []).map((i) => [i.name.toLowerCase(), i.id]))
      for (const src of srcItems) {
        const existingId = existing.get(src.name.toLowerCase())
        if (existingId) {
          targetItemBySource.set(src.id, existingId)
          skipped.budget_items++
          continue
        }
        const { data: created, error: insertError } = await db
          .from("budget_items")
          .insert({
            budget_period_id: to_period_id,
            name: src.name,
            category_id: src.category_id,
            assigned_amount: zeroParents ? 0 : src.assigned_amount,
            initial_used_amount: 0,
            notes: zeroParents ? null : src.notes,
            created_by: userId
          })
          .select("id")
          .single()
        if (insertError) throw insertError
        targetItemBySource.set(src.id, created.id)
        copied.budget_items++
      }
    }

    // ── 3. Sub-items, skipping name or category clashes under the same target parent ──
    const targetParentIds = [...targetBudgetBySource.values(), ...targetItemBySource.values()]
    const taken = new Map<string, { names: Set<string>; categories: Set<string> }>()
    const slot = (parentId: string) => {
      let s = taken.get(parentId)
      if (!s) {
        s = { names: new Set(), categories: new Set() }
        taken.set(parentId, s)
      }
      return s
    }
    if (srcSubs.length > 0 && targetParentIds.length > 0) {
      for (const column of ["ministry_budget_id", "budget_item_id"] as const) {
        const { data, error } = await db
          .from("budget_sub_items")
          .select("ministry_budget_id, budget_item_id, name, category_id")
          .eq("is_active", true)
          .in(column, targetParentIds)
        if (error) throw error
        for (const row of data ?? []) {
          const s = slot((row.ministry_budget_id ?? row.budget_item_id) as string)
          s.names.add(row.name.toLowerCase())
          if (row.category_id) s.categories.add(row.category_id)
        }
      }
    }

    for (const src of srcSubs) {
      const isMinistry = src.ministry_budget_id !== null
      const parentId = isMinistry
        ? targetBudgetBySource.get(src.ministry_budget_id as string)
        : targetItemBySource.get(src.budget_item_id as string)
      if (!parentId) continue
      const s = slot(parentId)
      const categoryId = isMinistry ? null : src.category_id
      if (s.names.has(src.name.toLowerCase()) || (categoryId && s.categories.has(categoryId))) {
        skipped.sub_items++
        continue
      }
      const { error } = await db.from("budget_sub_items").insert({
        ministry_budget_id: isMinistry ? parentId : null,
        budget_item_id: isMinistry ? null : parentId,
        name: src.name,
        assigned_amount: src.assigned_amount,
        notes: src.notes,
        category_id: categoryId,
        created_by: userId
      })
      if (error) {
        if (error.code === "23505") {
          skipped.sub_items++
          continue
        }
        throw error
      }
      s.names.add(src.name.toLowerCase())
      if (categoryId) s.categories.add(categoryId)
      copied.sub_items++
    }

    await auditService.logSystem({
      entity: "BUDGET_PERIOD",
      action: "BUDGET_COPIED",
      user_id: userId,
      entity_id: to_period_id,
      new_value: { from_period_id, to_period_id, scope, copied, skipped }
    })

    return { copied, skipped }
  }
}
