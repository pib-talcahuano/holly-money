import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database.types"

export async function assertExpenseCategory(db: SupabaseClient<Database>, categoryId: string) {
  const { data, error } = await db
    .from("movement_categories")
    .select("movement_type")
    .eq("id", categoryId)
    .maybeSingle()
  if (error) throw error
  if (data?.movement_type !== "EXPENSE") {
    throw new Error("Solo se pueden vincular categorías de egreso")
  }
}
