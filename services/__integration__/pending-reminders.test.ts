/**
 * @jest-environment node
 *
 * get_pending_reminders integration test. Requires a running local Supabase instance.
 * Skipped automatically when NEXT_PUBLIC_SUPABASE_URL is not set or not local.
 * Guards against schema renames (e.g. budget_intentions.description -> purpose)
 * silently breaking the function behind POST /api/reminders.
 */

import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database.types"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? ""

const isLocal =
  SUPABASE_URL.startsWith("http://127.0.0.1") || SUPABASE_URL.startsWith("http://localhost")

const describeIfLocal = isLocal && SUPABASE_URL && SECRET_KEY ? describe : describe.skip

describeIfLocal("get_pending_reminders", () => {
  it("runs against the current schema and returns the three lists", async () => {
    const admin = createClient<Database>(SUPABASE_URL, SECRET_KEY)
    const { data, error } = await admin.rpc("get_pending_reminders")

    expect(error).toBeNull()
    const result = data as Record<string, unknown[]>
    expect(Array.isArray(result.intentions)).toBe(true)
    expect(Array.isArray(result.settlements)).toBe(true)
    expect(Array.isArray(result.missing_transfers)).toBe(true)
  })
})
