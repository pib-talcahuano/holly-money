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
import { movementsService } from "@/services/movements/movements.service"

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
  const deliveredBy = `Zelmira ${marker}`
  const categoryName = `Totals fixture ${marker}`
  const subcategoryName = `Totals sub ${marker}`
  let categoryId = ""
  let subcategoryId = ""
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
      .insert({ movement_type: "INCOME", name: categoryName })
      .select()
      .single()
    if (categoryError) throw categoryError
    categoryId = category.id

    const { data: subcategory, error: subcategoryError } = await admin
      .from("movement_subcategories")
      .insert({ category_id: categoryId, name: subcategoryName })
      .select()
      .single()
    if (subcategoryError) throw subcategoryError
    subcategoryId = subcategory.id

    const base = { created_by_id: E2E_ADMIN_ID, category_id: categoryId, notes: marker }
    const { data: movements, error } = await admin
      .from("movements")
      .insert([
        {
          ...base,
          movement_type: "INCOME",
          amount: 1000,
          subcategory_id: subcategoryId,
          delivered_by: deliveredBy,
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
    if (subcategoryId) await admin.from("movement_subcategories").delete().eq("id", subcategoryId)
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

  describe("totals() count matches list() for the same text", () => {
    const texts: Record<string, () => string> = {
      "notes marker": () => marker,
      "delivered_by name": () => deliveredBy,
      "category name": () => categoryName,
      "subcategory name": () => subcategoryName,
      "amount of a fixture": () => "2500",
      "amount with thousands dot": () => "2.500",
      "wildcard asterisk": () => `Zel*${marker}`,
      "no matches": () => `${marker}-no-match`
    }

    for (const [label, getText] of Object.entries(texts)) {
      it(`agrees for ${label}`, async () => {
        const client = await signIn()
        const search = getText()
        const totals = await movementsService.totals(client, { search, movement_type: "ALL" })
        const list = await movementsService.list(client, {
          search,
          movement_type: "ALL",
          status: "ACTIVE"
        })
        expect(totals.income.count + totals.expense.count).toBe(list.count)
      })
    }

    it("finds the expected fixtures through each branch", async () => {
      const client = await signIn()
      const byDelivered = await movementsService.totals(client, { search: deliveredBy })
      expect(byDelivered.income).toEqual({ total: 1000, count: 1 })
      const bySub = await movementsService.totals(client, { search: subcategoryName })
      expect(bySub.income).toEqual({ total: 1000, count: 1 })
      const byCategory = await movementsService.totals(client, { search: categoryName })
      expect(byCategory.income).toEqual({ total: 3500, count: 2 })
      expect(byCategory.expense).toEqual({ total: 400, count: 1 })
      expect(byCategory.net).toBe(3100)
      const none = await movementsService.totals(client, { search: `${marker}-no-match` })
      expect(none.net).toBe(0)
    })
  })
})
