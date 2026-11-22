import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database.types"
import { TITHES_CATEGORY_NAME, groupTithers, titherTotals } from "@/lib/utils/tithers"
import type { Tither, TithersTotals, TitherRow } from "@/types/tithers"

type DB = SupabaseClient<Database>

// PostgREST caps each response at 1000 rows.
const PAGE_SIZE = 1000

export const tithersService = {
  async list(
    db: DB,
    input: { year: number }
  ): Promise<{ categoryFound: boolean; tithers: Tither[]; totals: TithersTotals }> {
    const { data: category, error: categoryError } = await db
      .from("movement_categories")
      .select("id")
      .eq("name", TITHES_CATEGORY_NAME)
      .eq("movement_type", "INCOME")
      .maybeSingle()
    if (categoryError) throw categoryError
    if (!category) {
      return {
        categoryFound: false,
        tithers: [],
        totals: { total: 0, count: 0, titherCount: 0 }
      }
    }

    const rows: TitherRow[] = []
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await db
        .from("movements")
        .select("delivered_by, amount, movement_date")
        .eq("category_id", category.id)
        .eq("status", "ACTIVE")
        .gte("movement_date", `${input.year}-01-01`)
        .lte("movement_date", `${input.year}-12-31`)
        .order("movement_date", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(from, from + PAGE_SIZE - 1)
      if (error) throw error
      const page = data ?? []
      for (const row of page) {
        rows.push({
          delivered_by: row.delivered_by,
          amount: Number(row.amount),
          movement_date: row.movement_date
        })
      }
      if (page.length < PAGE_SIZE) break
    }

    const tithers = groupTithers(rows)
    return { categoryFound: true, tithers, totals: titherTotals(tithers) }
  }
}
