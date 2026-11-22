import { render, screen } from "@testing-library/react"
import { TithersYearSelect } from "../tithers-year-select"

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }))

describe("TithersYearSelect", () => {
  it("selects the current year among the options", () => {
    render(<TithersYearSelect year={2025} options={[2026, 2025, 2024]} />)
    expect(screen.getByRole("combobox", { name: "Año" })).toHaveValue("2025")
  })

  it("adds a selected year that is outside the options, keeping descending order", () => {
    render(<TithersYearSelect year={2005} options={[2026, 2025, 2024, 2023, 2022]} />)
    expect(screen.getByRole("combobox", { name: "Año" })).toHaveValue("2005")
    const values = screen.getAllByRole("option").map((o) => o.textContent)
    expect(values).toEqual(["2026", "2025", "2024", "2023", "2022", "2005"])
  })
})
