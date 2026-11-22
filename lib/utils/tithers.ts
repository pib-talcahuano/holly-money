import { normalizeName } from "@/lib/utils/name-suggestions"
import type { Tither, TithersTotals, TitherRow } from "@/types/tithers"

export const TITHES_CATEGORY_NAME = "Diezmos"
export const UNNAMED_TITHER_LABEL = "Sin nombre"

const MIN_YEAR = 2000
const SPARKLINE_PADDING_X = 4
const SPARKLINE_PADDING_Y = 2

const santiagoYearFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Santiago",
  year: "numeric"
})

type Group = {
  order: number
  count: number
  total: number
  lastDate: string
  spellings: Map<string, number>
  monthlyTotals: number[]
  monthlyCounts: number[]
}

const round2 = (value: number) => Math.round(value * 100) / 100

/** `rows` must be ordered from most recent to oldest. */
export function groupTithers(rows: TitherRow[]): Tither[] {
  const groups = new Map<string, Group>()
  for (const row of rows) {
    const raw = row.delivered_by ?? ""
    const key = normalizeName(raw)
    let group = groups.get(key)
    if (!group) {
      group = {
        order: groups.size,
        count: 0,
        total: 0,
        lastDate: row.movement_date,
        spellings: new Map(),
        monthlyTotals: new Array<number>(12).fill(0),
        monthlyCounts: new Array<number>(12).fill(0)
      }
      groups.set(key, group)
    }
    group.count += 1
    group.total += row.amount
    if (row.movement_date > group.lastDate) group.lastDate = row.movement_date
    if (key) group.spellings.set(raw, (group.spellings.get(raw) ?? 0) + 1)
    const month = Number(row.movement_date.slice(5, 7)) - 1
    if (month >= 0 && month < 12) {
      group.monthlyTotals[month] += row.amount
      group.monthlyCounts[month] += 1
    }
  }

  return [...groups.entries()]
    .map(([key, group]): Tither & { order: number } => {
      let name = UNNAMED_TITHER_LABEL
      if (key) {
        let best = 0
        for (const [spelling, count] of group.spellings) {
          if (count > best) {
            name = spelling
            best = count
          }
        }
      }
      return {
        key,
        name,
        unnamed: key === "",
        count: group.count,
        total: round2(group.total),
        lastDate: group.lastDate,
        monthlyTotals: group.monthlyTotals.map(round2),
        monthlyCounts: group.monthlyCounts,
        order: group.order
      }
    })
    .sort((a, b) => {
      if (a.unnamed !== b.unnamed) return a.unnamed ? 1 : -1
      return b.total - a.total || a.name.localeCompare(b.name, "es") || a.order - b.order
    })
    .map((entry) => ({
      key: entry.key,
      name: entry.name,
      unnamed: entry.unnamed,
      count: entry.count,
      total: entry.total,
      lastDate: entry.lastDate,
      monthlyTotals: entry.monthlyTotals,
      monthlyCounts: entry.monthlyCounts
    }))
}

export function titherTotals(tithers: Tither[]): TithersTotals {
  let total = 0
  let count = 0
  let titherCount = 0
  for (const tither of tithers) {
    total += tither.total
    count += tither.count
    if (!tither.unnamed) titherCount += 1
  }
  return { total: round2(total), count, titherCount }
}

const fmt = (value: number) => String(Number(value.toFixed(2)))

export function sparklinePoints(values: number[], width = 96, height = 24): string {
  if (values.length === 0) return ""
  const max = Math.max(...values)
  const innerWidth = width - SPARKLINE_PADDING_X * 2
  const innerHeight = height - SPARKLINE_PADDING_Y * 2
  return values
    .map((value, index) => {
      const x =
        values.length === 1
          ? width / 2
          : SPARKLINE_PADDING_X + (index * innerWidth) / (values.length - 1)
      const ratio = max > 0 ? value / max : 0
      const y = height - SPARKLINE_PADDING_Y - ratio * innerHeight
      return `${fmt(x)},${fmt(y)}`
    })
    .join(" ")
}

export function titherMovementsHref(name: string): string {
  return `/movements?search=${encodeURIComponent(name)}&movement_type=INCOME`
}

export function currentYearInSantiago(now: Date = new Date()): number {
  const year = santiagoYearFormatter.formatToParts(now).find((p) => p.type === "year")?.value
  return Number(year)
}

export function parseTithersYear(value: string | undefined, currentYear: number): number {
  if (value === undefined || !/^\d{4}$/.test(value)) return currentYear
  const year = Number(value)
  return year >= MIN_YEAR && year <= currentYear ? year : currentYear
}

export function titherYearOptions(currentYear: number, count = 5): number[] {
  return Array.from({ length: count }, (_, i) => currentYear - i)
}
