type SearchIds = { categoryIds: string[]; subcategoryIds: string[] }

const AMOUNT_PATTERN = /^(\d+|\d{1,3}(\.\d{3})+)$/

/**
 * Builds the PostgREST `or(...)` string for the global movement search.
 * `term` must already be sanitized with `sanitizePostgrestSearch`.
 */
export function buildMovementSearchFilter(term: string, ids: SearchIds): string | null {
  if (!term) return null

  const conditions = [`delivered_by.ilike.%${term}%`, `notes.ilike.%${term}%`]
  if (ids.categoryIds.length) conditions.push(`category_id.in.(${ids.categoryIds.join(",")})`)
  if (ids.subcategoryIds.length) {
    conditions.push(`subcategory_id.in.(${ids.subcategoryIds.join(",")})`)
  }
  if (AMOUNT_PATTERN.test(term)) conditions.push(`amount.eq.${term.replace(/\./g, "")}`)

  return conditions.join(",")
}
