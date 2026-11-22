/**
 * @jest-environment node
 *
 * Integration test for peopleService.merge against a real local Supabase instance.
 * Run with: pnpm supabase start && pnpm test services/__integration__/people-merge.test.ts
 *
 * Skipped automatically when NEXT_PUBLIC_SUPABASE_URL is not set or not local.
 *
 * Fixtures carry a unique "ZZPEOPLE-<timestamp>" marker in every name and only those names are
 * merged; real movements are never touched. Fixture date allocation (see the registry in
 * rls.test.ts): 2094 (2094-01) — movements only.
 */

import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database.types"
import { peopleService } from "@/services/people/people.service"

// The audit service reads the session through next/headers, which is unavailable outside a request.
jest.mock("@/lib/supabase/server", () => ({
  getCurrentUser: jest.fn().mockResolvedValue(null)
}))

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ""
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? ""

const isLocal =
  SUPABASE_URL.startsWith("http://127.0.0.1") || SUPABASE_URL.startsWith("http://localhost")

const describeIfLocal = isLocal && SUPABASE_URL && SECRET_KEY ? describe : describe.skip

// Matches supabase/seed.sql, local only.
const E2E_ADMIN = { email: "e2e-admin@local.test", password: "Testing123!" }
const E2E_ADMIN_ID = "e2e00000-0000-0000-0000-000000000001"

describeIfLocal("peopleService.merge", () => {
  const marker = `ZZPEOPLE-${Date.now()}`
  const ana = `ZZP Ana ${marker}`
  const anaSpaced = `zzp  ana ${marker}`
  const anita = `ZZP Anita ${marker}`
  const target = `ZZP Ana Maria ${marker}`
  const categoryName = `People fixture ${marker}`
  let categoryId = ""
  const movementIds: string[] = []
  const serviceClient = () =>
    createClient<Database>(SUPABASE_URL, SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

  async function signIn() {
    const client = createClient<Database>(SUPABASE_URL, PUBLISHABLE_KEY)
    const { error } = await client.auth.signInWithPassword(E2E_ADMIN)
    if (error) throw error
    return client
  }

  beforeAll(async () => {
    const admin = serviceClient()
    const { data: category, error: categoryError } = await admin
      .from("movement_categories")
      .insert({ movement_type: "INCOME", name: categoryName })
      .select()
      .single()
    if (categoryError) throw categoryError
    categoryId = category.id

    const base = {
      created_by_id: E2E_ADMIN_ID,
      category_id: categoryId,
      amount: 1000,
      status: "ACTIVE" as const,
      notes: marker
    }
    const { data, error } = await admin
      .from("movements")
      .insert([
        {
          ...base,
          movement_type: "INCOME",
          delivered_by: ana,
          movement_date: "2094-01-10T12:00:00Z"
        },
        {
          ...base,
          movement_type: "INCOME",
          delivered_by: anaSpaced,
          movement_date: "2094-01-11T12:00:00Z"
        },
        {
          ...base,
          movement_type: "INCOME",
          delivered_by: anita,
          movement_date: "2094-01-12T12:00:00Z"
        },
        {
          ...base,
          movement_type: "INCOME",
          delivered_by: anita,
          movement_date: "2094-01-13T12:00:00Z",
          status: "CANCELLED" as const,
          cancellation_reason: "fixture"
        },
        {
          ...base,
          movement_type: "EXPENSE",
          delivered_by: ana,
          movement_date: "2094-01-14T12:00:00Z"
        }
      ])
      .select("id, movement_type, delivered_by, status")
    if (error) throw error
    movementIds.push(...data.map((m) => m.id))
  })

  afterAll(async () => {
    const admin = serviceClient()
    if (movementIds.length) {
      // movement_audit_log.movement_id is ON DELETE RESTRICT: audit rows go first.
      await admin.from("movement_audit_log").delete().in("movement_id", movementIds)
      await admin.from("movements").delete().in("id", movementIds)
    }
    await admin
      .from("system_audit_log")
      .delete()
      .eq("entity", "people")
      .contains("new_value", { to_name: target })
    if (categoryId) await admin.from("movement_categories").delete().eq("id", categoryId)
  })

  it("merges the income spellings, leaves expenses alone and audits every change", async () => {
    const client = await signIn()
    const before = await serviceClient()
      .from("movements")
      .select("id, movement_type, delivered_by")
      .in("id", movementIds)
    expect(before.error).toBeNull()
    const previousById = new Map((before.data ?? []).map((m) => [m.id, m.delivered_by]))

    const preview = await peopleService.preview(client, {
      movementType: "INCOME",
      fromNames: [ana, anaSpaced, anita],
      toName: target
    })
    expect(preview).toEqual({ affected: 4 })

    const result = await peopleService.merge(client, {
      movementType: "INCOME",
      fromNames: [ana, anaSpaced, anita],
      toName: target,
      userId: E2E_ADMIN_ID
    })
    expect(result).toEqual({ updated: 4 })

    const after = await serviceClient()
      .from("movements")
      .select("id, movement_type, delivered_by, status, updated_by_id")
      .in("id", movementIds)
    expect(after.error).toBeNull()
    const income = (after.data ?? []).filter((m) => m.movement_type === "INCOME")
    const expense = (after.data ?? []).filter((m) => m.movement_type === "EXPENSE")
    expect(income).toHaveLength(4)
    expect(income.every((m) => m.delivered_by === target)).toBe(true)
    expect(income.every((m) => m.updated_by_id === E2E_ADMIN_ID)).toBe(true)
    expect(income.some((m) => m.status === "CANCELLED")).toBe(true)
    expect(expense).toHaveLength(1)
    expect(expense[0].delivered_by).toBe(ana)

    const audit = await serviceClient()
      .from("movement_audit_log")
      .select("movement_id, action, previous_value, new_value, note")
      .in("movement_id", movementIds)
    expect(audit.error).toBeNull()
    const rows = audit.data ?? []
    expect(rows).toHaveLength(4)
    for (const row of rows) {
      expect(row.action).toBe("Nombre actualizado")
      expect(row.new_value).toEqual({ delivered_by: target })
      expect(row.previous_value).toEqual({ delivered_by: previousById.get(row.movement_id) })
      expect(row.note).toMatch(/^Unión de nombres /)
    }
    expect(new Set(rows.map((r) => r.movement_id)).size).toBe(4)

    const mergeId = (rows[0].note as string).replace("Unión de nombres ", "")
    const system = await serviceClient()
      .from("system_audit_log")
      .select("entity, action, new_value")
      .eq("entity", "people")
      .eq("action", "Nombres unidos")
      .contains("new_value", { merge_id: mergeId })
    expect(system.error).toBeNull()
    expect(system.data).toHaveLength(1)
    expect(system.data?.[0].new_value).toMatchObject({
      movement_type: "INCOME",
      to_name: target,
      updated: 4
    })
  })
})
