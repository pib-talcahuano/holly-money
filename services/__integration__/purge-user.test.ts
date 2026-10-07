/**
 * @jest-environment node
 *
 * purge_user integration tests. Require a running local Supabase instance.
 * Skipped automatically when NEXT_PUBLIC_SUPABASE_URL is not set or not local.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database.types"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ""
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? ""

const isLocal =
  SUPABASE_URL.startsWith("http://127.0.0.1") || SUPABASE_URL.startsWith("http://localhost")

const describeIfLocal = isLocal && SUPABASE_URL && SECRET_KEY ? describe : describe.skip

type Counts = Record<string, number>

describeIfLocal("purge_user", () => {
  // Lazy: describe.skip still runs this body, and createClient throws on an empty key (CI).
  let client: SupabaseClient<Database> | undefined
  const getAdmin = () => (client ??= createClient<Database>(SUPABASE_URL, SECRET_KEY))
  const createdAuthIds: string[] = []

  async function createUser(label: string) {
    const email = `purge-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.test`
    const { data, error } = await getAdmin().auth.admin.createUser({ email, email_confirm: true })
    expect(error).toBeNull()
    const id = data.user!.id
    createdAuthIds.push(id)
    const { error: profileError } = await getAdmin()
      .from("users")
      .insert({ id, full_name: `Purge ${label}`, email, roles: ["FINANCE"], status: "ACTIVE" })
    expect(profileError).toBeNull()
    return id
  }

  async function seedMovement(createdBy: string) {
    const { data: category } = await getAdmin()
      .from("movement_categories")
      .select("id")
      .limit(1)
      .single()
    const { data, error } = await getAdmin()
      .from("movements")
      .insert({
        movement_date: "2099-01-01",
        movement_type: "EXPENSE",
        amount: 1000,
        created_by_id: createdBy,
        category_id: category!.id
      })
      .select("id")
      .single()
    expect(error).toBeNull()
    return data!.id
  }

  afterAll(async () => {
    // Best-effort cleanup for users a failed test left behind.
    for (const id of createdAuthIds) {
      await getAdmin().rpc("purge_user", { p_user_id: id })
    }
  })

  it("is not callable by anon or authenticated roles", async () => {
    const anon = createClient<Database>(SUPABASE_URL, PUBLISHABLE_KEY)
    const { error } = await anon.rpc("purge_user", {
      p_user_id: "00000000-0000-0000-0000-000000000000"
    })
    expect(error?.message).toMatch(/permission denied|not found/i)
  })

  it("rejects an unknown user", async () => {
    const { error } = await getAdmin().rpc("purge_user", {
      p_user_id: "00000000-0000-0000-0000-000000000000"
    })
    expect(error?.message).toMatch(/Usuario no encontrado/)
  })

  it("dry run reports counts and changes nothing", async () => {
    const userId = await createUser("dry")
    const movementId = await seedMovement(userId)

    const { data, error } = await getAdmin().rpc("purge_user", {
      p_user_id: userId,
      p_dry_run: true
    })
    expect(error).toBeNull()
    expect((data as { counts: Counts }).counts.movements).toBe(1)

    const { data: still } = await getAdmin().from("movements").select("id").eq("id", movementId)
    expect(still).toHaveLength(1)
    const { data: user } = await getAdmin().from("users").select("id").eq("id", userId)
    expect(user).toHaveLength(1)
  })

  it("purges a user with movements, an intention and its foreign-owned transfer", async () => {
    const userId = await createUser("victim")
    const otherId = await createUser("other")
    const { data: ministry } = await getAdmin().from("ministries").select("id").limit(1).single()

    const movementId = await seedMovement(userId)
    // A movement owned by someone else, linked to the victim's intention via a transfer.
    const foreignMovementId = await seedMovement(otherId)
    const { data: intention, error: intentionError } = await getAdmin()
      .from("budget_intentions")
      .insert({
        ministry_id: ministry!.id,
        requested_by: userId,
        amount: 500,
        purpose: "purge test",
        funding_method: "TRANSFER"
      })
      .select("id")
      .single()
    expect(intentionError).toBeNull()
    const { error: transferError } = await getAdmin().from("intention_transfers").insert({
      intention_id: intention!.id,
      registered_by: otherId,
      amount: 500,
      transfer_date: "2099-01-01",
      movement_id: foreignMovementId
    })
    expect(transferError).toBeNull()
    await getAdmin().from("request_comments").insert({
      entity_type: "INTENTION",
      entity_id: intention!.id,
      user_id: otherId,
      message: "hi"
    })
    // A record that survives and only "touches" the victim.
    const survivorId = await seedMovement(otherId)
    await getAdmin().from("movements").update({ updated_by_id: userId }).eq("id", survivorId)

    const { data, error } = await getAdmin().rpc("purge_user", { p_user_id: userId })
    expect(error).toBeNull()
    const result = data as {
      counts: Counts
      foreign_reach: { movements: number; transfers: number }
      storage_paths: string[]
    }
    expect(result.counts.movements).toBe(2)
    expect(result.counts.intentions).toBe(1)
    expect(result.counts.transfers).toBe(1)
    expect(result.counts.comments).toBe(1)
    expect(result.foreign_reach).toMatchObject({ movements: 1, transfers: 1 })

    const gone = await Promise.all([
      getAdmin().from("movements").select("id").in("id", [movementId, foreignMovementId]),
      getAdmin().from("budget_intentions").select("id").eq("id", intention!.id),
      getAdmin().from("request_comments").select("id").eq("entity_id", intention!.id),
      getAdmin().from("users").select("id").eq("id", userId)
    ])
    for (const { data: rows } of gone) expect(rows).toHaveLength(0)
    const { data: authUser } = await getAdmin().auth.admin.getUserById(userId)
    expect(authUser.user).toBeNull()

    const { data: survivor } = await getAdmin()
      .from("movements")
      .select("id, updated_by_id")
      .eq("id", survivorId)
      .single()
    expect(survivor).toEqual({ id: survivorId, updated_by_id: null })
  })
})
