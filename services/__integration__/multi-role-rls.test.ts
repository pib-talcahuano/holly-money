/**
 * @jest-environment node
 *
 * Multi-role RLS integration tests. Require a running local Supabase instance.
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

type Role = Database["public"]["Enums"]["user_role"]
const PASSWORD = "Testing123!multi"

describeIfLocal("RLS: users with several roles", () => {
  let adminClient: SupabaseClient<Database> | undefined
  const getAdmin = () => (adminClient ??= createClient<Database>(SUPABASE_URL, SECRET_KEY))
  const createdIds: string[] = []
  const createdPaymentMethodIds: string[] = []

  // Creates an auth user + profile with the given roles and returns a client signed in as them.
  async function signedInAs(label: string, roles: Role[]) {
    const email = `multirole-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.test`
    const { data, error } = await getAdmin().auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true
    })
    expect(error).toBeNull()
    const id = data.user!.id
    createdIds.push(id)

    const { error: profileError } = await getAdmin()
      .from("users")
      .insert({ id, full_name: `Multi ${label}`, email, roles, status: "ACTIVE" })
    expect(profileError).toBeNull()

    const client = createClient<Database>(SUPABASE_URL, PUBLISHABLE_KEY)
    const { error: signInError } = await client.auth.signInWithPassword({
      email,
      password: PASSWORD
    })
    expect(signInError).toBeNull()
    return client
  }

  afterAll(async () => {
    for (const id of createdPaymentMethodIds) {
      await getAdmin().from("payment_methods").delete().eq("id", id)
    }
    for (const id of createdIds) {
      await getAdmin().rpc("purge_user", { p_user_id: id })
    }
  })

  it("has_any_role matches when any one of the user's roles overlaps", async () => {
    const client = await signedInAs("bm", ["BURSAR", "MINISTER"])

    const bursar = await client.rpc("has_any_role", { p_roles: ["BURSAR"] })
    const minister = await client.rpc("has_any_role", { p_roles: ["MINISTER"] })
    const admin = await client.rpc("has_any_role", { p_roles: ["ADMIN"] })

    expect(bursar.data).toBe(true)
    expect(minister.data).toBe(true)
    expect(admin.data).toBe(false)
  })

  it("a bursar+minister keeps bursar write access", async () => {
    const client = await signedInAs("bm-write", ["BURSAR", "MINISTER"])

    const { data, error } = await client
      .from("payment_methods")
      .insert({ name: `multi-role-${Date.now()}` })
      .select("id")
      .single()

    expect(error).toBeNull()
    if (data) createdPaymentMethodIds.push(data.id)
  })

  it("a finance+minister cannot do bursar writes", async () => {
    const client = await signedInAs("fm", ["FINANCE", "MINISTER"])

    const { error } = await client.from("payment_methods").insert({ name: "should-fail" })

    expect(error?.message).toMatch(/row-level security/i)
  })

  it("a bursar+minister cannot create ministries (ADMIN-only)", async () => {
    const client = await signedInAs("bm-min", ["BURSAR", "MINISTER"])

    const { error } = await client.from("ministries").insert({ name: "should-fail" })

    expect(error?.message).toMatch(/row-level security/i)
  })

  it("an ADMIN can still create ministries", async () => {
    const client = await signedInAs("adm", ["ADMIN"])

    const { data, error } = await client
      .from("ministries")
      .insert({ name: `multi-role-admin-${Date.now()}` })
      .select("id")
      .single()

    expect(error).toBeNull()
    if (data) await getAdmin().from("ministries").delete().eq("id", data.id)
  })

  it("the CHECK constraint rejects invalid role sets", async () => {
    const id = (
      await getAdmin().auth.admin.createUser({
        email: `multirole-check-${Date.now()}@example.test`,
        email_confirm: true
      })
    ).data.user!.id
    createdIds.push(id)

    const base = {
      id,
      full_name: "Check",
      email: `check-${id}@example.test`,
      status: "ACTIVE" as const
    }
    for (const roles of [[], ["ADMIN", "BURSAR"], ["DELEGATE", "MINISTER"], ["BURSAR", "BURSAR"]]) {
      const { error } = await getAdmin()
        .from("users")
        .insert({ ...base, roles: roles as Role[] })
      expect(error?.message).toMatch(/users_roles_valid_check/)
    }
  })
})
