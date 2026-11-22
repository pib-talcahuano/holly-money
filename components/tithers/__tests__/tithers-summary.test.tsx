import { render, screen } from "@testing-library/react"
import { TithersSummary } from "../tithers-summary"

describe("TithersSummary", () => {
  it("shows the totals for the year", () => {
    render(<TithersSummary totals={{ total: 636000, count: 40, titherCount: 4 }} year={2026} />)
    expect(screen.getByText("$636.000")).toBeInTheDocument()
    expect(screen.getByText("4")).toBeInTheDocument()
    expect(screen.getByText("40")).toBeInTheDocument()
    expect(screen.getByText("En 2026")).toBeInTheDocument()
  })
})
