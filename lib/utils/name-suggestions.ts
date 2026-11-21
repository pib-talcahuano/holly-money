export type NameSuggestion = { name: string; count: number }

export function normalizeName(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim()
}

type Group = { order: number; total: number; spellings: Map<string, number> }

/** `names` must be ordered from most recent to oldest. */
export function groupNameSuggestions(names: string[], limit: number): NameSuggestion[] {
  const groups = new Map<string, Group>()
  for (const raw of names) {
    const key = normalizeName(raw)
    if (!key) continue
    let group = groups.get(key)
    if (!group) {
      group = { order: groups.size, total: 0, spellings: new Map() }
      groups.set(key, group)
    }
    group.total += 1
    group.spellings.set(raw, (group.spellings.get(raw) ?? 0) + 1)
  }

  return [...groups.values()]
    .sort((a, b) => b.total - a.total || a.order - b.order)
    .slice(0, limit)
    .map((group) => {
      let name = ""
      let best = 0
      for (const [spelling, count] of group.spellings) {
        if (count > best) {
          name = spelling
          best = count
        }
      }
      return { name, count: group.total }
    })
}

/** Builds an `ilike` pattern (without `%`) where accent-prone letters match any single char. */
export function accentInsensitivePattern(term: string): string {
  return normalizeName(term).replace(/[aeioun]/g, "_")
}
