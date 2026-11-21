export const LATE_REGISTRATION_DAYS = 30

const MS_PER_DAY = 86_400_000
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

const santiagoDayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Santiago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
})

function toUtcMidnight(year: number, month: number, day: number): number | null {
  const time = Date.UTC(year, month - 1, day)
  const check = new Date(time)
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null
  }
  return time
}

/**
 * Whole days between the movement date and the Santiago calendar day of `createdAt`,
 * when strictly greater than LATE_REGISTRATION_DAYS. Otherwise (or on invalid input) null.
 */
export function getLateRegistrationDays(movementDate: string, createdAt: string): number | null {
  const match = DATE_ONLY.exec(movementDate)
  if (!match) return null
  const movementTime = toUtcMidnight(Number(match[1]), Number(match[2]), Number(match[3]))
  if (movementTime === null) return null

  const created = new Date(createdAt)
  if (Number.isNaN(created.getTime())) return null

  const parts = santiagoDayFormatter.formatToParts(created)
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const createdTime = toUtcMidnight(part("year"), part("month"), part("day"))
  if (createdTime === null) return null

  const days = Math.round((createdTime - movementTime) / MS_PER_DAY)
  return days > LATE_REGISTRATION_DAYS ? days : null
}
