/**
 * @jest-environment node
 *
 * RLS integration tests. Require a running local Supabase instance.
 * Run with: pnpm supabase start && pnpm test services/__integration__
 *
 * Skipped automatically when NEXT_PUBLIC_SUPABASE_URL is not set or not local.
 */

import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database.types"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ""
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? ""

const isLocal =
  SUPABASE_URL.startsWith("http://127.0.0.1") || SUPABASE_URL.startsWith("http://localhost")

const describeIfLocal = isLocal && SUPABASE_URL && SECRET_KEY ? describe : describe.skip

describeIfLocal("RLS: unauthenticated client", () => {
  // createClient inside each test to avoid throwing at collection time when keys are empty
  it("cannot read movements table", async () => {
    const anon = createClient<Database>(SUPABASE_URL, PUBLISHABLE_KEY)
    const { data, error } = await anon.from("movements").select("id").limit(1)
    if (error) {
      expect(error.message).toMatch(/permission denied|JWT/i)
    } else {
      expect(data).toHaveLength(0)
    }
  })

  it("cannot read users table", async () => {
    const anon = createClient<Database>(SUPABASE_URL, PUBLISHABLE_KEY)
    const { data, error } = await anon.from("users").select("id").limit(1)
    if (error) {
      expect(error.message).toMatch(/permission denied|JWT/i)
    } else {
      expect(data).toHaveLength(0)
    }
  })

  it("cannot read role_permissions table", async () => {
    const anon = createClient<Database>(SUPABASE_URL, PUBLISHABLE_KEY)
    const { data, error } = await anon.from("role_permissions").select("*").limit(1)
    if (error) {
      expect(error.message).toMatch(/permission denied|JWT/i)
    } else {
      expect(data).toHaveLength(0)
    }
  })
})

describeIfLocal("RLS: admin client bypasses all policies", () => {
  it("can read role_permissions table", async () => {
    const admin = createClient<Database>(SUPABASE_URL, SECRET_KEY)
    const { data, error } = await admin.from("role_permissions").select("*").limit(1)
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it("can read users table", async () => {
    const admin = createClient<Database>(SUPABASE_URL, SECRET_KEY)
    const { error } = await admin.from("users").select("id").limit(1)
    expect(error).toBeNull()
  })
})

// Etapa 10 — docs/plans/10-presupuesto-por-ministerio.md. Matches supabase/seed.sql,
// local only (see e2e/fixtures/users.ts, same credentials).
const E2E_USERS = {
  admin: { email: "e2e-admin@local.test", password: "Testing123!" },
  bursar: { email: "e2e-bursar@local.test", password: "Testing123!" },
  finance: { email: "e2e-finance@local.test", password: "Testing123!" },
  minister: { email: "e2e-minister@local.test", password: "Testing123!" }
}
const E2E_MINISTRY_ID = "e2e00000-0000-0000-0000-0000000000a1"

async function signIn(user: { email: string; password: string }) {
  const client = createClient<Database>(SUPABASE_URL, PUBLISHABLE_KEY)
  const { error } = await client.auth.signInWithPassword(user)
  if (error) throw error
  return client
}

describeIfLocal("RLS: unauthenticated client — ministry budgets (Etapa 10)", () => {
  it("cannot read budget_periods table", async () => {
    const anon = createClient<Database>(SUPABASE_URL, PUBLISHABLE_KEY)
    const { data, error } = await anon.from("budget_periods").select("id").limit(1)
    if (error) {
      expect(error.message).toMatch(/permission denied|JWT/i)
    } else {
      expect(data).toHaveLength(0)
    }
  })

  it("cannot read ministry_budgets table", async () => {
    const anon = createClient<Database>(SUPABASE_URL, PUBLISHABLE_KEY)
    const { data, error } = await anon.from("ministry_budgets").select("id").limit(1)
    if (error) {
      expect(error.message).toMatch(/permission denied|JWT/i)
    } else {
      expect(data).toHaveLength(0)
    }
  })
})

describeIfLocal("RLS: ministry_budgets write access (Etapa 10)", () => {
  // Self-contained fixture (not the manual data from Task 5's browser testing,
  // which isn't part of supabase/seed.sql and wouldn't survive a fresh
  // `db reset`): a period + a ministry_budgets row for the e2e ministry,
  // created via the admin client and torn down after.
  let fixturePeriodId: string | null = null

  beforeAll(async () => {
    if (!isLocal || !SUPABASE_URL || !SECRET_KEY) return
    const admin = createClient<Database>(SUPABASE_URL, SECRET_KEY)
    const { data: period, error: periodError } = await admin
      .from("budget_periods")
      .insert({
        label: "RLS fixture",
        year: 2099,
        start_date: "2099-06-01",
        end_date: "2099-06-30"
      })
      .select()
      .single()
    if (periodError) throw periodError
    fixturePeriodId = period.id

    const { error: budgetError } = await admin.from("ministry_budgets").insert({
      ministry_id: E2E_MINISTRY_ID,
      budget_period_id: period.id,
      assigned_amount: 1000
    })
    if (budgetError) throw budgetError
  })

  afterAll(async () => {
    if (!fixturePeriodId) return
    const admin = createClient<Database>(SUPABASE_URL, SECRET_KEY)
    // ministry_budgets has no ON DELETE CASCADE from budget_periods — clean up
    // the child row explicitly before the parent, or the period delete fails.
    await admin.from("ministry_budgets").delete().eq("budget_period_id", fixturePeriodId)
    await admin.from("budget_periods").delete().eq("id", fixturePeriodId)
  })

  it("MINISTER cannot insert a budget_periods row", async () => {
    const minister = await signIn(E2E_USERS.minister)
    const { error } = await minister.from("budget_periods").insert({
      label: "RLS test — should fail",
      year: 2096,
      start_date: "2099-01-01",
      end_date: "2099-01-31"
    })
    expect(error).not.toBeNull()
    await minister.auth.signOut()
  })

  it("MINISTER can read ministry_budgets for their own ministry but cannot write it", async () => {
    const minister = await signIn(E2E_USERS.minister)
    const { data: readData, error: readError } = await minister
      .from("ministry_budgets")
      .select("id")
      .eq("ministry_id", E2E_MINISTRY_ID)
    expect(readError).toBeNull()
    // Non-empty, not just "not an error": an RLS policy that silently excludes
    // every row would also pass an empty-array check, defeating the point of
    // this test — the beforeAll fixture guarantees at least one real row here.
    expect((readData ?? []).length).toBeGreaterThan(0)

    const { error: writeError } = await minister.from("ministry_budgets").insert({
      ministry_id: E2E_MINISTRY_ID,
      budget_period_id: fixturePeriodId as string,
      assigned_amount: 1000
    })
    expect(writeError).not.toBeNull()
    await minister.auth.signOut()
  })

  it("ADMIN can create and clean up a budget_periods row", async () => {
    const admin = await signIn(E2E_USERS.admin)
    const { data, error } = await admin
      .from("budget_periods")
      .insert({
        label: "RLS test — admin",
        year: 2095,
        start_date: "2099-02-01",
        end_date: "2099-02-28"
      })
      .select()
      .single()
    expect(error).toBeNull()
    expect(data?.id).toBeTruthy()

    if (data?.id) {
      const cleanup = createClient<Database>(SUPABASE_URL, SECRET_KEY)
      await cleanup.from("budget_periods").delete().eq("id", data.id)
    }
    await admin.auth.signOut()
  })

  it("BURSAR can create and clean up a budget_periods row", async () => {
    const bursar = await signIn(E2E_USERS.bursar)
    const { data, error } = await bursar
      .from("budget_periods")
      .insert({
        label: "RLS test — bursar",
        year: 2094,
        start_date: "2099-03-01",
        end_date: "2099-03-31"
      })
      .select()
      .single()
    expect(error).toBeNull()
    expect(data?.id).toBeTruthy()

    if (data?.id) {
      const cleanup = createClient<Database>(SUPABASE_URL, SECRET_KEY)
      await cleanup.from("budget_periods").delete().eq("id", data.id)
    }
    await bursar.auth.signOut()
  })
})

const E2E_ADMIN_ID = "e2e00000-0000-0000-0000-000000000001"

describeIfLocal("RLS: unauthenticated client — budget_items", () => {
  it("cannot read budget_items table", async () => {
    const anon = createClient<Database>(SUPABASE_URL, PUBLISHABLE_KEY)
    const { data, error } = await anon.from("budget_items").select("id").limit(1)
    if (error) {
      expect(error.message).toMatch(/permission denied|JWT/i)
    } else {
      expect(data).toHaveLength(0)
    }
  })
})

describeIfLocal("RLS + RPC: budget_items", () => {
  // Self-contained fixture: a far-future period, an EXPENSE and an INCOME category
  // and movements around the period boundaries, all torn down in afterAll
  // (children before parents — no ON DELETE CASCADE).
  let periodId = ""
  let expenseCategoryId = ""
  let incomeCategoryId = ""
  let expenseItemId = ""
  let incomeItemId = ""
  const movementIds: string[] = []
  const adminClient = () => createClient<Database>(SUPABASE_URL, SECRET_KEY)

  beforeAll(async () => {
    const admin = adminClient()
    const { data: period, error: periodError } = await admin
      .from("budget_periods")
      .insert({
        label: "Items fixture",
        year: 2098,
        start_date: "2098-01-01",
        end_date: "2098-01-31"
      })
      .select()
      .single()
    if (periodError) throw periodError
    periodId = period.id

    const { data: categories, error: categoryError } = await admin
      .from("movement_categories")
      .insert([
        { movement_type: "EXPENSE", name: "Items fixture expense" },
        { movement_type: "INCOME", name: "Items fixture income" }
      ])
      .select()
    if (categoryError) throw categoryError
    expenseCategoryId = categories.find((c) => c.movement_type === "EXPENSE")!.id
    incomeCategoryId = categories.find((c) => c.movement_type === "INCOME")!.id

    // Explicit status on every row: a bulk insert with differing keys sends null for the rest.
    const base = { created_by_id: E2E_ADMIN_ID, status: "ACTIVE" as const }
    const { data: movements, error: movementError } = await admin
      .from("movements")
      .insert([
        // first day, last day -> count
        {
          ...base,
          category_id: expenseCategoryId,
          movement_type: "EXPENSE",
          amount: 100,
          movement_date: "2098-01-01T12:00:00Z"
        },
        {
          ...base,
          category_id: expenseCategoryId,
          movement_type: "EXPENSE",
          amount: 200,
          movement_date: "2098-01-31T12:00:00Z"
        },
        // outside the period -> ignored
        {
          ...base,
          category_id: expenseCategoryId,
          movement_type: "EXPENSE",
          amount: 400,
          movement_date: "2098-02-02T12:00:00Z"
        },
        // cancelled -> ignored
        {
          ...base,
          category_id: expenseCategoryId,
          movement_type: "EXPENSE",
          amount: 800,
          movement_date: "2098-01-15T12:00:00Z",
          status: "CANCELLED"
        },
        // income movement in an income category -> ignored
        {
          ...base,
          category_id: incomeCategoryId,
          movement_type: "INCOME",
          amount: 1600,
          movement_date: "2098-01-15T12:00:00Z"
        }
      ])
      .select("id")
    if (movementError) throw movementError
    movementIds.push(...movements.map((m) => m.id))

    const { data: items, error: itemsError } = await admin
      .from("budget_items")
      .insert([
        {
          budget_period_id: periodId,
          name: "Fixture expense item",
          assigned_amount: 1000,
          initial_used_amount: 50,
          category_id: expenseCategoryId
        },
        {
          budget_period_id: periodId,
          name: "Fixture income item",
          assigned_amount: 500,
          initial_used_amount: 0,
          category_id: incomeCategoryId
        }
      ])
      .select()
    if (itemsError) throw itemsError
    expenseItemId = items.find((i) => i.name === "Fixture expense item")!.id
    incomeItemId = items.find((i) => i.name === "Fixture income item")!.id
  })

  afterAll(async () => {
    if (!periodId) return
    const admin = adminClient()
    await admin.from("budget_items").delete().eq("budget_period_id", periodId)
    if (movementIds.length) await admin.from("movements").delete().in("id", movementIds)
    await admin.from("movement_categories").delete().in("id", [expenseCategoryId, incomeCategoryId])
    await admin.from("budget_periods").delete().eq("id", periodId)
  })

  it("MINISTER can neither read nor insert budget_items", async () => {
    const minister = await signIn(E2E_USERS.minister)
    const { data } = await minister
      .from("budget_items")
      .select("id")
      .eq("budget_period_id", periodId)
    expect(data ?? []).toHaveLength(0)
    const { error } = await minister
      .from("budget_items")
      .insert({ budget_period_id: periodId, name: "Should fail", assigned_amount: 1 })
    expect(error).not.toBeNull()
    await minister.auth.signOut()
  })

  it("BURSAR can read, insert and update budget_items", async () => {
    const bursar = await signIn(E2E_USERS.bursar)
    const { data: read } = await bursar
      .from("budget_items")
      .select("id")
      .eq("budget_period_id", periodId)
    expect((read ?? []).length).toBeGreaterThan(0)

    const { data: inserted, error: insertError } = await bursar
      .from("budget_items")
      .insert({ budget_period_id: periodId, name: "Bursar item", assigned_amount: 10 })
      .select()
      .single()
    expect(insertError).toBeNull()

    const { error: updateError } = await bursar
      .from("budget_items")
      .update({ is_active: false })
      .eq("id", inserted!.id)
    expect(updateError).toBeNull()
    await bursar.auth.signOut()
  })

  it("rejects a duplicate name (case-insensitive) in the same period", async () => {
    const { error } = await adminClient()
      .from("budget_items")
      .insert({ budget_period_id: periodId, name: "FIXTURE EXPENSE ITEM", assigned_amount: 1 })
    expect(error?.code).toBe("23505")
  })

  it("get_budget_items_summary counts only active EXPENSE movements inside the period", async () => {
    const { data, error } = await adminClient().rpc("get_budget_items_summary", {
      p_period_id: periodId
    })
    expect(error).toBeNull()
    const rows = data as unknown as {
      item_id: string
      name: string
      category_name: string | null
      assigned_amount: number
      used_amount: number
      remaining: number
    }[]
    const expenseRow = rows.find((r) => r.item_id === expenseItemId)!
    expect(expenseRow.category_name).toBe("Items fixture expense")
    expect(Number(expenseRow.used_amount)).toBe(350) // 50 initial + 100 + 200
    expect(Number(expenseRow.remaining)).toBe(650)
    const incomeRow = rows.find((r) => r.item_id === incomeItemId)!
    expect(Number(incomeRow.used_amount)).toBe(0)
  })

  it("frees the name of a deactivated item so it can be created again", async () => {
    const admin = adminClient()
    const { data: first, error: firstError } = await admin
      .from("budget_items")
      .insert({
        budget_period_id: periodId,
        name: "Reusable name",
        assigned_amount: 1,
        initial_used_amount: 0
      })
      .select()
      .single()
    expect(firstError).toBeNull()
    await admin.from("budget_items").update({ is_active: false }).eq("id", first!.id)

    const { error } = await admin.from("budget_items").insert({
      budget_period_id: periodId,
      name: "reusable NAME",
      assigned_amount: 1,
      initial_used_amount: 0
    })
    expect(error).toBeNull()
  })

  it("get_budget_items_summary omits inactive items and is not callable by authenticated users", async () => {
    const bursar = await signIn(E2E_USERS.bursar)
    const { data } = await adminClient().rpc("get_budget_items_summary", { p_period_id: periodId })
    expect((data as unknown as { name: string }[]).some((r) => r.name === "Bursar item")).toBe(
      false
    )
    const { error } = await bursar.rpc("get_budget_items_summary", { p_period_id: periodId })
    expect(error).not.toBeNull()
    await bursar.auth.signOut()
  })
})

describeIfLocal("RPC privileges: service-role-only summaries", () => {
  // Supabase default privileges grant EXECUTE on public functions to anon/authenticated,
  // and `REVOKE ... FROM PUBLIC` does not remove those grants. These two SECURITY DEFINER
  // RPCs bypass RLS and are only meant to be called through the admin client.
  const rpcs = [
    ["get_ministry_budget_summary", {}],
    ["get_budget_items_summary", {}],
    ["get_budget_sub_items_summary", {}],
    ["get_ministry_leftover_summary", { p_ministry_id: E2E_MINISTRY_ID }]
  ] as const

  it.each(rpcs)("%s is not callable by a MINISTER", async (name, args) => {
    const minister = await signIn(E2E_USERS.minister)
    const { error } = await minister.rpc(name, args)
    expect(error).not.toBeNull()
    await minister.auth.signOut()
  })

  it.each(rpcs)("%s is not callable by anon", async (name, args) => {
    const anon = createClient<Database>(SUPABASE_URL, PUBLISHABLE_KEY)
    const { error } = await anon.rpc(name, args)
    expect(error).not.toBeNull()
  })

  it.each(rpcs)("%s still works for the service role", async (name, args) => {
    const admin = createClient<Database>(SUPABASE_URL, SECRET_KEY)
    const { error } = await admin.rpc(name, args)
    expect(error).toBeNull()
  })
})

describeIfLocal("RPC: delete_ministry_if_unused", () => {
  const args = { p_ministry_id: E2E_MINISTRY_ID }

  it("is not callable by a MINISTER", async () => {
    const minister = await signIn(E2E_USERS.minister)
    const { error } = await minister.rpc("delete_ministry_if_unused", args)
    expect(error).not.toBeNull()
    await minister.auth.signOut()
  })

  it("is not callable by anon", async () => {
    const anon = createClient<Database>(SUPABASE_URL, PUBLISHABLE_KEY)
    const { error } = await anon.rpc("delete_ministry_if_unused", args)
    expect(error).not.toBeNull()
  })

  it("reports blockers and keeps a ministry that has history", async () => {
    const admin = createClient<Database>(SUPABASE_URL, SECRET_KEY)
    const { data, error } = await admin.rpc("delete_ministry_if_unused", args)
    expect(error).toBeNull()
    expect(data).toMatchObject({ deleted: false })
    expect(Object.keys((data as { blockers: object }).blockers).length).toBeGreaterThan(0)
    const { data: still } = await admin.from("ministries").select("id").eq("id", E2E_MINISTRY_ID)
    expect(still).toHaveLength(1)
  })

  it("deletes a ministry with no dependents", async () => {
    const admin = createClient<Database>(SUPABASE_URL, SECRET_KEY)
    const { data: created, error: createError } = await admin
      .from("ministries")
      .insert({ name: `tmp-delete-${Date.now()}` })
      .select("id")
      .single()
    expect(createError).toBeNull()
    const { data, error } = await admin.rpc("delete_ministry_if_unused", {
      p_ministry_id: created!.id
    })
    expect(error).toBeNull()
    expect(data).toEqual({ deleted: true })
    const { data: gone } = await admin.from("ministries").select("id").eq("id", created!.id)
    expect(gone).toHaveLength(0)
  })
  it("blocks a ministry whose only history is an inactive assignment", async () => {
    const admin = createClient<Database>(SUPABASE_URL, SECRET_KEY)
    const { data: someUser } = await admin.from("users").select("id").limit(1).single()
    const { data: created } = await admin
      .from("ministries")
      .insert({ name: `tmp-history-${Date.now()}` })
      .select("id")
      .single()
    await admin.from("ministry_assignments").insert({
      ministry_id: created!.id,
      user_id: someUser!.id,
      unassigned_at: new Date().toISOString()
    })
    const { data, error } = await admin.rpc("delete_ministry_if_unused", {
      p_ministry_id: created!.id
    })
    expect(error).toBeNull()
    expect(data).toEqual({ deleted: false, blockers: { ministry_assignments: 1 } })

    await admin.from("ministry_assignments").delete().eq("ministry_id", created!.id)
    await admin.rpc("delete_ministry_if_unused", { p_ministry_id: created!.id })
  })
})

describeIfLocal("RLS: budget_sub_items", () => {
  let periodId = ""
  let otherMinistryId = ""
  let budgetItemId = ""
  let ownBudgetId = ""
  let otherBudgetId = ""
  const adminClient = () => createClient<Database>(SUPABASE_URL, SECRET_KEY)

  beforeAll(async () => {
    const admin = adminClient()
    const { data: period, error: periodError } = await admin
      .from("budget_periods")
      .insert({
        label: "Sub-items fixture",
        year: 2097,
        start_date: "2097-03-01",
        end_date: "2098-02-28"
      })
      .select()
      .single()
    if (periodError) throw periodError
    periodId = period.id

    const { data: ministry, error: ministryError } = await admin
      .from("ministries")
      .insert({ name: `tmp-subitems-${Date.now()}` })
      .select("id")
      .single()
    if (ministryError) throw ministryError
    otherMinistryId = ministry.id

    const { data: budgets, error: budgetsError } = await admin
      .from("ministry_budgets")
      .insert([
        { ministry_id: E2E_MINISTRY_ID, budget_period_id: periodId, assigned_amount: 0 },
        { ministry_id: otherMinistryId, budget_period_id: periodId, assigned_amount: 0 }
      ])
      .select()
    if (budgetsError) throw budgetsError
    ownBudgetId = budgets.find((b) => b.ministry_id === E2E_MINISTRY_ID)!.id
    otherBudgetId = budgets.find((b) => b.ministry_id === otherMinistryId)!.id

    const { data: item, error: itemError } = await admin
      .from("budget_items")
      .insert({ budget_period_id: periodId, name: "Sub-items parent", assigned_amount: 0 })
      .select()
      .single()
    if (itemError) throw itemError
    budgetItemId = item.id

    const { error: subError } = await admin.from("budget_sub_items").insert([
      { ministry_budget_id: ownBudgetId, name: "Own sub", assigned_amount: 10 },
      { ministry_budget_id: otherBudgetId, name: "Other sub", assigned_amount: 10 },
      { budget_item_id: budgetItemId, name: "Item sub", assigned_amount: 10 }
    ])
    if (subError) throw subError
  })

  afterAll(async () => {
    if (!periodId) return
    const admin = adminClient()
    await admin
      .from("budget_sub_items")
      .delete()
      .in("ministry_budget_id", [ownBudgetId, otherBudgetId].filter(Boolean))
    await admin.from("budget_sub_items").delete().eq("budget_item_id", budgetItemId)
    await admin.from("budget_items").delete().eq("budget_period_id", periodId)
    await admin.from("ministry_budgets").delete().eq("budget_period_id", periodId)
    await admin.from("ministries").delete().eq("id", otherMinistryId)
    await admin.from("budget_periods").delete().eq("id", periodId)
  })

  it("anon cannot read budget_sub_items", async () => {
    const anon = createClient<Database>(SUPABASE_URL, PUBLISHABLE_KEY)
    const { data } = await anon.from("budget_sub_items").select("id").limit(1)
    expect(data ?? []).toHaveLength(0)
  })

  it.each([["admin"], ["bursar"]] as const)("%s can insert and update", async (who) => {
    const client = await signIn(E2E_USERS[who])
    const { data, error } = await client
      .from("budget_sub_items")
      .insert({ budget_item_id: budgetItemId, name: `${who} sub`, assigned_amount: 5 })
      .select()
      .single()
    expect(error).toBeNull()
    const { error: updateError } = await client
      .from("budget_sub_items")
      .update({ is_active: false })
      .eq("id", data!.id)
    expect(updateError).toBeNull()
    await client.auth.signOut()
  })

  it("FINANCE reads every sub-item but cannot insert", async () => {
    const finance = await signIn(E2E_USERS.finance)
    const { data } = await finance
      .from("budget_sub_items")
      .select("name")
      .in("name", ["Own sub", "Other sub", "Item sub"])
    expect((data ?? []).map((r) => r.name).sort()).toEqual(["Item sub", "Other sub", "Own sub"])
    const { error } = await finance
      .from("budget_sub_items")
      .insert({ budget_item_id: budgetItemId, name: "Finance sub", assigned_amount: 1 })
    expect(error).not.toBeNull()
    await finance.auth.signOut()
  })

  it("MINISTER reads only sub-items of their own ministry budget, and cannot insert", async () => {
    const minister = await signIn(E2E_USERS.minister)
    const { data } = await minister
      .from("budget_sub_items")
      .select("name")
      .in("name", ["Own sub", "Other sub", "Item sub"])
    expect((data ?? []).map((r) => r.name)).toEqual(["Own sub"])
    const { error } = await minister
      .from("budget_sub_items")
      .insert({ ministry_budget_id: ownBudgetId, name: "Minister sub", assigned_amount: 1 })
    expect(error).not.toBeNull()
    await minister.auth.signOut()
  })

  it("nobody can delete (no DELETE policy)", async () => {
    const admin = await signIn(E2E_USERS.admin)
    const { data } = await admin.from("budget_sub_items").delete().eq("name", "Item sub").select()
    expect(data ?? []).toHaveLength(0)
    await admin.auth.signOut()
  })

  it("rejects a sub-item with both parents or none", async () => {
    const admin = adminClient()
    const both = await admin.from("budget_sub_items").insert({
      ministry_budget_id: ownBudgetId,
      budget_item_id: budgetItemId,
      name: "Both",
      assigned_amount: 1
    })
    expect(both.error).not.toBeNull()
    const none = await admin.from("budget_sub_items").insert({ name: "None", assigned_amount: 1 })
    expect(none.error).not.toBeNull()
  })

  it("rejects a duplicate active name (case-insensitive) under the same parent", async () => {
    const { error } = await adminClient()
      .from("budget_sub_items")
      .insert({ budget_item_id: budgetItemId, name: "ITEM SUB", assigned_amount: 1 })
    expect(error?.code).toBe("23505")
  })
})

describeIfLocal("RPC: budget summaries with sub-items", () => {
  // Far-future period so the fixture never overlaps real data. Torn down children-first.
  const admin = () => createClient<Database>(SUPABASE_URL, SECRET_KEY)
  let periodId = ""
  let ministryBudgetId = ""
  let itemId = ""
  const subIds: Record<string, string> = {}
  const intentionIds: string[] = []
  const movementIds: string[] = []
  const categoryIds: string[] = []

  beforeAll(async () => {
    const db = admin()
    const { data: period, error: periodError } = await db
      .from("budget_periods")
      .insert({
        label: "Sub-items fixture",
        year: 2097,
        start_date: "2097-01-01",
        end_date: "2097-01-31"
      })
      .select()
      .single()
    if (periodError) throw periodError
    periodId = period.id

    const { data: mb, error: mbError } = await db
      .from("ministry_budgets")
      .insert({
        budget_period_id: periodId,
        ministry_id: E2E_MINISTRY_ID,
        assigned_amount: 9999,
        initial_used_amount: 10
      })
      .select()
      .single()
    if (mbError) throw mbError
    ministryBudgetId = mb.id

    const { data: subs, error: subsError } = await db
      .from("budget_sub_items")
      .insert([
        { ministry_budget_id: ministryBudgetId, name: "A", assigned_amount: 300 },
        { ministry_budget_id: ministryBudgetId, name: "B", assigned_amount: 200 },
        { ministry_budget_id: ministryBudgetId, name: "C", assigned_amount: 100 }
      ])
      .select()
    if (subsError) throw subsError
    for (const sub of subs) subIds[sub.name] = sub.id

    const intention = (
      over: Pick<
        Database["public"]["Tables"]["budget_intentions"]["Insert"],
        "amount" | "funding_method"
      > &
        Partial<Database["public"]["Tables"]["budget_intentions"]["Insert"]>
    ) => ({
      ministry_id: E2E_MINISTRY_ID,
      requested_by: E2E_ADMIN_ID,
      purpose: "Sub-items fixture",
      status: "APPROVED" as const,
      ...over
    })
    const { data: intentions, error: intentionsError } = await db
      .from("budget_intentions")
      .insert([
        intention({ amount: 120, funding_method: "TRANSFER", budget_sub_item_id: subIds.A }),
        intention({ amount: 400, funding_method: "TRANSFER", budget_sub_item_id: subIds.A }),
        intention({
          amount: 50,
          funding_method: "REIMBURSEMENT",
          reviewed_at: "2097-01-12T12:00:00Z"
        }),
        intention({ amount: 100, funding_method: "TRANSFER", budget_sub_item_id: subIds.C })
      ])
      .select()
    if (intentionsError) throw intentionsError
    intentionIds.push(...intentions.map((i) => i.id))
    const byAmount = (n: number) => intentions.find((i) => i.amount === n)!.id

    const { error: transfersError } = await db.from("intention_transfers").insert([
      {
        intention_id: byAmount(120),
        amount: 120,
        transfer_date: "2097-01-10",
        registered_by: E2E_ADMIN_ID
      },
      // outside the period -> ignored
      {
        intention_id: byAmount(400),
        amount: 400,
        transfer_date: "2097-02-05",
        registered_by: E2E_ADMIN_ID
      },
      {
        intention_id: byAmount(100),
        amount: 100,
        transfer_date: "2097-01-15",
        registered_by: E2E_ADMIN_ID
      }
    ])
    if (transfersError) throw transfersError

    // C is deactivated after it already has spend: spend keeps counting, assignment does not.
    const { error: deactivateError } = await db
      .from("budget_sub_items")
      .update({ is_active: false })
      .eq("id", subIds.C)
    if (deactivateError) throw deactivateError

    // Item side: own category X (30 unassigned) and a sub-item on category Y (60).
    const { data: categories, error: categoryError } = await db
      .from("movement_categories")
      .insert([
        { movement_type: "EXPENSE", name: "Sub-items fixture X" },
        { movement_type: "EXPENSE", name: "Sub-items fixture Y" }
      ])
      .select()
    if (categoryError) throw categoryError
    categoryIds.push(...categories.map((c) => c.id))
    const catX = categories.find((c) => c.name.endsWith("X"))!.id
    const catY = categories.find((c) => c.name.endsWith("Y"))!.id

    const { data: item, error: itemError } = await db
      .from("budget_items")
      .insert({
        budget_period_id: periodId,
        name: "Item with subs",
        assigned_amount: 0,
        category_id: catX
      })
      .select()
      .single()
    if (itemError) throw itemError
    itemId = item.id

    const { data: itemSub, error: itemSubError } = await db
      .from("budget_sub_items")
      .insert({ budget_item_id: itemId, name: "Y fund", assigned_amount: 150, category_id: catY })
      .select()
      .single()
    if (itemSubError) throw itemSubError
    subIds.Y = itemSub.id

    const base = {
      created_by_id: E2E_ADMIN_ID,
      status: "ACTIVE" as const,
      movement_type: "EXPENSE" as const
    }
    const { data: movements, error: movementError } = await db
      .from("movements")
      .insert([
        { ...base, category_id: catY, amount: 60, movement_date: "2097-01-05T12:00:00Z" },
        { ...base, category_id: catX, amount: 30, movement_date: "2097-01-06T12:00:00Z" }
      ])
      .select("id")
    if (movementError) throw movementError
    movementIds.push(...movements.map((m) => m.id))
  })

  afterAll(async () => {
    if (!periodId) return
    const db = admin()
    if (intentionIds.length) {
      await db.from("intention_transfers").delete().in("intention_id", intentionIds)
      await db.from("budget_intentions").delete().in("id", intentionIds)
    }
    await db.from("budget_sub_items").delete().in("id", Object.values(subIds))
    await db.from("budget_items").delete().eq("budget_period_id", periodId)
    await db.from("ministry_budgets").delete().eq("budget_period_id", periodId)
    if (movementIds.length) await db.from("movements").delete().in("id", movementIds)
    if (categoryIds.length) await db.from("movement_categories").delete().in("id", categoryIds)
    await db.from("budget_periods").delete().eq("id", periodId)
  })

  it("ministry summary: parent assigned is the sum of active sub-items and used includes all spend", async () => {
    const { data, error } = await admin().rpc("get_ministry_budget_summary", {
      p_period_id: periodId
    })
    expect(error).toBeNull()
    const row = (data as unknown as Record<string, unknown>[]).find(
      (r) => r.ministry_id === E2E_MINISTRY_ID
    )!
    expect(row).toMatchObject({
      assigned_amount: 500, // A 300 + B 200; deactivated C and the stored 9999 are ignored
      used_amount: 280, // initial 10 + A 120 + C 100 (deactivated, still counts) + unassigned 50
      unassigned_used: 50,
      remaining: 220
    })
  })

  it("sub-item summary: per-fund used/remaining for active sub-items only", async () => {
    const { data, error } = await admin().rpc("get_budget_sub_items_summary", {
      p_period_id: periodId
    })
    expect(error).toBeNull()
    const rows = data as unknown as Record<string, unknown>[]
    const byName = (n: string) => rows.find((r) => r.name === n)
    expect(byName("A")).toMatchObject({
      sub_item_id: subIds.A,
      parent_type: "MINISTRY",
      ministry_id: E2E_MINISTRY_ID,
      budget_item_id: null,
      assigned_amount: 300,
      used_amount: 120,
      remaining: 180
    })
    expect(byName("B")).toMatchObject({ used_amount: 0, remaining: 200 })
    expect(byName("C")).toBeUndefined()
    expect(byName("Y fund")).toMatchObject({
      parent_type: "ITEM",
      ministry_id: null,
      budget_item_id: itemId,
      assigned_amount: 150,
      used_amount: 60,
      remaining: 90
    })
  })

  it("items summary: parent sums sub-items and adds own-category spend not covered by them", async () => {
    const { data, error } = await admin().rpc("get_budget_items_summary", { p_period_id: periodId })
    expect(error).toBeNull()
    const row = (data as unknown as Record<string, unknown>[]).find((r) => r.item_id === itemId)
    expect(row).toMatchObject({
      assigned_amount: 150,
      used_amount: 90, // Y 60 + own category X 30
      unassigned_used: 30,
      remaining: 60
    })
  })
})
