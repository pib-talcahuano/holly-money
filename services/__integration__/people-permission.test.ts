/**
 * @jest-environment node
 *
 * Integration test for the MANAGE_PEOPLE seed. Requires a running local Supabase instance.
 * Skipped automatically when NEXT_PUBLIC_SUPABASE_URL is not set or not local.
 * Uses no fixture years/dates (only reads role_permissions).
 */

import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database.types"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? ""

const isLocal =
  SUPABASE_URL.startsWith("http://127.0.0.1") || SUPABASE_URL.startsWith("http://localhost")

const describeIfLocal = isLocal && SUPABASE_URL && SECRET_KEY ? describe : describe.skip

describeIfLocal("MANAGE_PEOPLE permission seed", () => {
  it("is granted to ADMIN only", async () => {
    const admin = createClient<Database>(SUPABASE_URL, SECRET_KEY)
    const { data, error } = await admin
      .from("role_permissions")
      .select("role, enabled")
      .eq("permission", "MANAGE_PEOPLE")

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data?.[0]).toEqual({ role: "ADMIN", enabled: true })
    expect(data?.filter((row) => row.role !== "ADMIN" && row.enabled)).toHaveLength(0)
  })
})
