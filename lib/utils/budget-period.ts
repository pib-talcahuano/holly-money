// A budget year runs from March 1 of `year` to the last day of February of `year + 1`.
export function budgetPeriodRange(year: number): { start_date: string; end_date: string } {
  // Day 0 of March (month index 2) is the last day of February.
  const lastFebDay = new Date(Date.UTC(year + 1, 2, 0)).getUTCDate()
  return {
    start_date: `${year}-03-01`,
    end_date: `${year + 1}-02-${String(lastFebDay).padStart(2, "0")}`
  }
}
