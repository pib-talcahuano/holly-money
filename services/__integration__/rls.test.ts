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
