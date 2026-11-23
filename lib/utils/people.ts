import { normalizeName } from "@/lib/utils/name-suggestions"
import type { DeliveredByRow, PersonName } from "@/types/people"

export function normalizeTargetName(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

/** Groups by the exact spelling; `sameAs` lists other spellings with the same normalized name. */
export function groupDeliveredByNames(rows: DeliveredByRow[]): PersonName[] {
  const groups = new Map<string, Omit<PersonName, "sameAs">>()
  for (const row of rows) {
    const name = row.delivered_by
    if (!name || !name.trim()) continue
    let group = groups.get(name)
    if (!group) {
      group = { name, count: 0, total: 0, lastDate: row.movement_date }
      groups.set(name, group)
    }
    group.count += 1
    if (row.status === "ACTIVE") group.total += row.amount
    if (row.movement_date > group.lastDate) group.lastDate = row.movement_date
  }

  const byNormalized = new Map<string, string[]>()
  for (const name of groups.keys()) {
    const key = normalizeName(name)
    byNormalized.set(key, [...(byNormalized.get(key) ?? []), name])
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      sameAs: (byNormalized.get(normalizeName(group.name)) ?? []).filter((n) => n !== group.name)
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "es"))
}
