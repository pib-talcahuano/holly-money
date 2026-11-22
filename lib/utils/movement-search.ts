type SearchIds = { categoryIds: string[]; subcategoryIds: string[] }

const AMOUNT_PATTERN = /^(\d+|\d{1,3}(\.\d{3})+)$/

/**
 * Returns the numeric amount a search term represents (plain digits or digits with
 * thousands dots), or null when the term is not an amount.
 */
export function parseAmountTerm(term: string): number | null {
  if (!AMOUNT_PATTERN.test(term)) return null
  return Number(term.replace(/\./g, ""))
}

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
  const amount = parseAmountTerm(term)
  if (amount !== null) conditions.push(`amount.eq.${amount}`)

  return conditions.join(",")
}
