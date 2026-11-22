export type Tither = {
  key: string
  name: string
  unnamed: boolean
  count: number
  total: number
  lastDate: string
  monthlyTotals: number[]
  monthlyCounts: number[]
}

export type TithersTotals = { total: number; count: number; titherCount: number }

export type TitherRow = { delivered_by: string | null; amount: number; movement_date: string }
