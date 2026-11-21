/**
 * @jest-environment node
 *
 * Integration tests for the get_movement_totals RPC. Require a running local Supabase instance.
 * Run with: pnpm supabase start && pnpm test services/__integration__/movement-totals.test.ts
 *
 * Skipped automatically when NEXT_PUBLIC_SUPABASE_URL is not set or not local.
 *
 * Fixture date allocation (see the registry in rls.test.ts): 2096 (2096-01) — movements only.
 */

import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database.types"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ""
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? ""

const isLocal =
  SUPABASE_URL.startsWith("http://127.0.0.1") || SUPABASE_URL.startsWith("http://localhost")

const describeIfLocal = isLocal && SUPABASE_URL && SECRET_KEY ? describe : describe.skip

// Matches supabase/seed.sql, local only.
const E2E_ADMIN = { email: "e2e-admin@local.test", password: "Testing123!" }
const E2E_ADMIN_ID = "e2e00000-0000-0000-0000-000000000001"

describeIfLocal("RPC: get_movement_totals", () => {
  const marker = `MOVTOT-${Date.now()}`
  let categoryId = ""
  const movementIds: string[] = []
  const adminClient = () => createClient<Database>(SUPABASE_URL, SECRET_KEY)

  async function signIn() {
    const client = createClient<Database>(SUPABASE_URL, PUBLISHABLE_KEY)
    const { error } = await client.auth.signInWithPassword(E2E_ADMIN)
    if (error) throw error
    return client
  }

  beforeAll(async () => {
    const admin = adminClient()
    const { data: category, error: categoryError } = await admin
      .from("movement_categories")
      .insert({ movement_type: "INCOME", name: `Totals fixture ${marker}` })
      .select()
      .single()
    if (categoryError) throw categoryError
    categoryId = category.id

    const base = { created_by_id: E2E_ADMIN_ID, category_id: categoryId, notes: marker }
    const { data: movements, error } = await admin
      .from("movements")
      .insert([
        {
          ...base,
          movement_type: "INCOME",
          amount: 1000,
          movement_date: "2096-01-10T12:00:00Z",
          status: "ACTIVE"
        },
        {
          ...base,
          movement_type: "INCOME",
          amount: 2500,
          movement_date: "2096-01-11T12:00:00Z",
          status: "ACTIVE"
        },
        {
          ...base,
          movement_type: "EXPENSE",
          amount: 400,
          movement_date: "2096-01-12T12:00:00Z",
          status: "ACTIVE"
        },
        {
          ...base,
          movement_type: "INCOME",
          amount: 7000,
          movement_date: "2096-01-13T12:00:00Z",
          status: "CANCELLED",
          cancellation_reason: "fixture"
        }
      ])
      .select("id")
    if (error) throw error
    movementIds.push(...movements.map((m) => m.id))
  })

  afterAll(async () => {
    const admin = adminClient()
    if (movementIds.length) await admin.from("movements").delete().in("id", movementIds)
    if (categoryId) await admin.from("movement_categories").delete().eq("id", categoryId)
  })

  it("sums active movements per type, excluding cancelled", async () => {
    const client = await signIn()
    const { data, error } = await client.rpc("get_movement_totals", { p_term: marker })
    expect(error).toBeNull()
    const rows = data ?? []
    expect(rows).toHaveLength(2)
    const income = rows.find((r) => r.movement_type === "INCOME")
    const expense = rows.find((r) => r.movement_type === "EXPENSE")
    expect(Number(income?.total)).toBe(3500)
    expect(Number(income?.record_count)).toBe(2)
    expect(Number(expense?.total)).toBe(400)
    expect(Number(expense?.record_count)).toBe(1)
  })

  it("filters by movement type", async () => {
    const client = await signIn()
    const { data, error } = await client.rpc("get_movement_totals", {
      p_term: marker,
      p_movement_type: "INCOME"
    })
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data?.[0].movement_type).toBe("INCOME")
    expect(Number(data?.[0].total)).toBe(3500)
  })

  it("matching by amount as well does not duplicate rows", async () => {
    const client = await signIn()
    const { data, error } = await client.rpc("get_movement_totals", {
      p_term: marker,
      p_amount: 400
    })
    expect(error).toBeNull()
    const expense = data?.find((r) => r.movement_type === "EXPENSE")
    expect(Number(expense?.total)).toBe(400)
    expect(Number(expense?.record_count)).toBe(1)
  })

  it("returns no rows when the term matches nothing", async () => {
    const client = await signIn()
    const { data, error } = await client.rpc("get_movement_totals", {
      p_term: `${marker}-no-match`
    })
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it("rejects a client without a session", async () => {
    const anon = createClient<Database>(SUPABASE_URL, PUBLISHABLE_KEY)
    const { data, error } = await anon.rpc("get_movement_totals", { p_term: marker })
    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/permission denied/i)
    expect(data).toBeNull()
  })
})
