import { render, screen, within } from "@testing-library/react"
import type { Tither } from "@/types/tithers"
import { TitherDetailDialog } from "../tither-detail-dialog"

jest.mock("../tither-monthly-chart-lazy", () => ({
  TitherMonthlyChartLazy: () => <div data-testid="monthly-chart" />
}))

const tither: Tither = {
  key: "ana",
  name: "Ana",
  unnamed: false,
  count: 2,
  total: 30000,
  lastDate: "2026-03-10",
  monthlyTotals: [0, 0, 30000, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  monthlyCounts: [0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0]
}

describe("TitherDetailDialog", () => {
  it("renders nothing without a tither", () => {
    render(<TitherDetailDialog tither={null} year={2026} onClose={jest.fn()} />)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("shows months without tithes as 0 and $0", () => {
    render(<TitherDetailDialog tither={tither} year={2026} onClose={jest.fn()} />)
    const dialog = screen.getByRole("dialog", { name: /Ana · 2026/ })
    expect(within(dialog).getAllByText("0")).toHaveLength(11)
    expect(within(dialog).getAllByText("$0")).toHaveLength(11)
    expect(within(dialog).getByText("Marzo")).toBeInTheDocument()
  })
})
