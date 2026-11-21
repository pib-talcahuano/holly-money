/**
 * @jest-environment node
 *
 * Integration test for ministryBudgetService.copyFromPeriod against a local Supabase.
 * Run with the env from `pnpm supabase status` (see rls.test.ts). Uses far-future years and
 * removes its fixtures afterwards.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database.types"
const mockLogSystem = jest.fn()
// The audit service reads request cookies (impersonation), which don't exist outside Next.
jest.mock("@/services/audit/audit.service", () => ({
  auditService: { logSystem: (...args: unknown[]) => mockLogSystem(...args) }
}))

import { ministryBudgetService } from "@/services/ministries/ministry-budget.service"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? ""

const isLocal =
  SUPABASE_URL.startsWith("http://127.0.0.1") || SUPABASE_URL.startsWith("http://localhost")
const describeIfLocal = isLocal && SECRET_KEY ? describe : describe.skip

// Years allocated across services/__integration__: see the map at the top of rls.test.ts.
const SRC_YEAR = 2081
const DST_YEAR = 2082

describeIfLocal("copyFromPeriod (local Supabase)", () => {
  // Created in beforeAll: describe.skip still runs this body, and createClient throws on empty keys.
  let db: SupabaseClient<Database>
  let srcId = ""
  let dstId = ""
  let userId = ""

  const counts = async (periodId: string) => {
    const [mb, items] = await Promise.all([
      db.from("ministry_budgets").select("id").eq("budget_period_id", periodId),
      db.from("budget_items").select("id").eq("budget_period_id", periodId)
    ])
    const parentIds = [...(mb.data ?? []), ...(items.data ?? [])].map((r) => r.id)
    const subs = await db
      .from("budget_sub_items")
      .select("id, ministry_budget_id, budget_item_id")
      .or(
        `ministry_budget_id.in.(${parentIds.join(",")}),budget_item_id.in.(${parentIds.join(",")})`
      )
    return {
      ministry_budgets: mb.data?.length ?? 0,
      budget_items: items.data?.length ?? 0,
      sub_items: parentIds.length ? (subs.data?.length ?? 0) : 0
    }
  }

  async function cleanup() {
    const { data: periods } = await db
      .from("budget_periods")
      .select("id")
      .in("year", [SRC_YEAR, DST_YEAR])
    const ids = (periods ?? []).map((p) => p.id)
    if (ids.length === 0) return
    const [mb, items] = await Promise.all([
      db.from("ministry_budgets").select("id").in("budget_period_id", ids),
      db.from("budget_items").select("id").in("budget_period_id", ids)
    ])
    const parents = [...(mb.data ?? []), ...(items.data ?? [])].map((r) => r.id)
    if (parents.length > 0) {
      await db.from("budget_sub_items").delete().in("ministry_budget_id", parents)
      await db.from("budget_sub_items").delete().in("budget_item_id", parents)
    }
    await db.from("ministry_budgets").delete().in("budget_period_id", ids)
    await db.from("budget_items").delete().in("budget_period_id", ids)
    await db.from("budget_periods").delete().in("id", ids)
  }

  beforeAll(async () => {
    db = createClient<Database>(SUPABASE_URL, SECRET_KEY)
    await cleanup()
    const { data: user } = await db.from("users").select("id").limit(1).single()
    userId = user!.id
    const { data: ministries } = await db.from("ministries").select("id").limit(1)
    const { data: cats } = await db
      .from("movement_categories")
      .select("id")
      .eq("movement_type", "EXPENSE")
      .limit(2)
    expect(ministries!.length).toBe(1)
    expect(cats!.length).toBe(2)

    const src = await ministryBudgetService.createPeriodForYear(db, SRC_YEAR, userId)
    const dst = await ministryBudgetService.createPeriodForYear(db, DST_YEAR, userId)
    srcId = src.id
    dstId = dst.id

    const { data: mbs } = await db
      .from("ministry_budgets")
      .insert(
        ministries!.map((m) => ({
          ministry_id: m.id,
          budget_period_id: srcId,
          assigned_amount: 1000,
          initial_used_amount: 77,
          created_by: userId
        }))
      )
      .select("id")
    const { data: item } = await db
      .from("budget_items")
      .insert({
        budget_period_id: srcId,
        name: "Aseo copia",
        category_id: cats![0].id,
        assigned_amount: 500,
        initial_used_amount: 33,
        created_by: userId
      })
      .select("id")
      .single()
    await db.from("budget_sub_items").insert([
      { ministry_budget_id: mbs![0].id, name: "Viajes", assigned_amount: 100, created_by: userId },
      { budget_item_id: item!.id, name: "Cloro", assigned_amount: 40, category_id: cats![1].id },
      { budget_item_id: item!.id, name: "Otro", assigned_amount: 10, category_id: cats![0].id }
    ])
  })

  afterAll(cleanup)

  it("copies everything with initial_used_amount 0, leaves the source alone, and is idempotent", async () => {
    const before = await counts(srcId)
    expect(before).toEqual({ ministry_budgets: 1, budget_items: 1, sub_items: 3 })

    const first = await ministryBudgetService.copyFromPeriod(
      db,
      { from_period_id: srcId, to_period_id: dstId, scope: "ALL" },
      userId
    )
    expect(first.copied).toEqual({ ministry_budgets: 1, budget_items: 1, sub_items: 3 })
    expect(await counts(dstId)).toEqual(before)

    const copiedParents = await db
      .from("ministry_budgets")
      .select("assigned_amount, initial_used_amount")
      .eq("budget_period_id", dstId)
    expect(copiedParents.data!.every((r) => r.initial_used_amount === 0)).toBe(true)
    const copiedItem = await db
      .from("budget_items")
      .select("assigned_amount, initial_used_amount")
      .eq("budget_period_id", dstId)
      .single()
    expect(copiedItem.data).toEqual({ assigned_amount: 500, initial_used_amount: 0 })

    const second = await ministryBudgetService.copyFromPeriod(
      db,
      { from_period_id: srcId, to_period_id: dstId, scope: "ALL" },
      userId
    )
    expect(second.copied).toEqual({ ministry_budgets: 0, budget_items: 0, sub_items: 0 })
    expect(second.skipped).toEqual({ ministry_budgets: 1, budget_items: 1, sub_items: 3 })
    expect(await counts(dstId)).toEqual(before)
    expect(await counts(srcId)).toEqual(before)
    expect(
      mockLogSystem.mock.calls.filter(([e]) => (e as { action: string }).action === "BUDGET_COPIED")
    ).toHaveLength(2)

    const srcParents = await db
      .from("ministry_budgets")
      .select("initial_used_amount")
      .eq("budget_period_id", srcId)
    expect(srcParents.data!.every((r) => r.initial_used_amount === 77)).toBe(true)
  })
})
