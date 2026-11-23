export type PeopleMovementType = "INCOME" | "EXPENSE"

export type PersonName = {
  name: string
  count: number
  total: number
  lastDate: string
  sameAs: string[]
}

export type DeliveredByRow = {
  delivered_by: string | null
  amount: number
  movement_date: string
  status: "ACTIVE" | "CANCELLED"
}
