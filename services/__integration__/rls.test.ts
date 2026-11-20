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
      .insert({ label: "RLS fixture", start_date: "2099-06-01", end_date: "2099-06-30" })
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
    const { error } = await minister
      .from("budget_periods")
      .insert({ label: "RLS test — should fail", start_date: "2099-01-01", end_date: "2099-01-31" })
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
      .insert({ label: "RLS test — admin", start_date: "2099-02-01", end_date: "2099-02-28" })
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
      .insert({ label: "RLS test — bursar", start_date: "2099-03-01", end_date: "2099-03-31" })
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
      .insert({ label: "Items fixture", start_date: "2098-01-01", end_date: "2098-01-31" })
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
