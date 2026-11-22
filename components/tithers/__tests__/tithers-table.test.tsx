import { fireEvent, render, screen, within } from "@testing-library/react"
import type { Tither } from "@/types/tithers"
import { TithersTable } from "../tithers-table"

jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }))
jest.mock("../tither-monthly-chart-lazy", () => ({
  TitherMonthlyChartLazy: () => <div data-testid="monthly-chart" />
}))

function months(values: Record<number, number>) {
  return Array.from({ length: 12 }, (_, i) => values[i] ?? 0)
}

const tithers: Tither[] = [
  {
    key: "hna. mabel",
    name: "Hna. Mabel",
    unnamed: false,
    count: 10,
    total: 200000,
    lastDate: "2026-11-12",
    monthlyTotals: months({ 9: 100000, 10: 100000 }),
    monthlyCounts: months({ 9: 5, 10: 5 })
  },
  {
    key: "juan perez",
    name: "Juan Pérez",
    unnamed: false,
    count: 9,
    total: 180000,
    lastDate: "2026-10-05",
    monthlyTotals: months({ 9: 180000 }),
    monthlyCounts: months({ 9: 9 })
  },
  {
    key: "",
    name: "Sin nombre",
    unnamed: true,
    count: 6,
    total: 42000,
    lastDate: "2026-09-01",
    monthlyTotals: months({ 8: 42000 }),
    monthlyCounts: months({ 8: 6 })
  }
]

describe("TithersTable", () => {
  it("lists the tithers with their figures", () => {
    render(<TithersTable tithers={tithers} year={2026} />)
    expect(screen.getByText("Hna. Mabel")).toBeInTheDocument()
    expect(screen.getByText("Juan Pérez")).toBeInTheDocument()
    expect(screen.getByText("$200.000")).toBeInTheDocument()
    expect(screen.getByText("10")).toBeInTheDocument()
    expect(screen.getByText("12-11-2026")).toBeInTheDocument()
  })

  it("filters by name ignoring accents and case", () => {
    render(<TithersTable tithers={tithers} year={2026} />)
    fireEvent.change(screen.getByPlaceholderText("Filtrar por nombre…"), {
      target: { value: "juan perez" }
    })
    expect(screen.getByText("Juan Pérez")).toBeInTheDocument()
    expect(screen.queryByText("Hna. Mabel")).not.toBeInTheDocument()
  })

  it("shows a message when nothing matches", () => {
    render(<TithersTable tithers={tithers} year={2026} />)
    fireEvent.change(screen.getByPlaceholderText("Filtrar por nombre…"), {
      target: { value: "zzz" }
    })
    expect(screen.getByText("Sin coincidencias.")).toBeInTheDocument()
  })

  it("shows an empty state without tithers", () => {
    render(<TithersTable tithers={[]} year={2026} />)
    expect(screen.getByText("No hay diezmos registrados en 2026.")).toBeInTheDocument()
  })

  it("renders the unnamed tither in italics and hides sparklines from assistive tech", () => {
    const { container } = render(<TithersTable tithers={tithers} year={2026} />)
    expect(screen.getByText("Sin nombre").className).toMatch(/italic/)
    const sparklines = container.querySelectorAll("svg[data-slot='tither-sparkline']")
    expect(sparklines).toHaveLength(3)
    sparklines.forEach((svg) => expect(svg).toHaveAttribute("aria-hidden", "true"))
  })

  it("opens the detail dialog and closes it with Escape", () => {
    render(<TithersTable tithers={tithers} year={2026} />)
    fireEvent.click(screen.getByText("Hna. Mabel"))
    const dialog = screen.getByRole("dialog", { name: /Hna\. Mabel/ })
    expect(within(dialog).getByText("$200.000")).toBeInTheDocument()
    expect(within(dialog).getByText("10")).toBeInTheDocument()
    expect(within(dialog).getByText("12-11-2026")).toBeInTheDocument()
    expect(within(dialog).getByTestId("monthly-chart")).toBeInTheDocument()
    expect(within(dialog).getAllByRole("row")).toHaveLength(13)
    expect(
      within(dialog).getByRole("link", { name: "Ver movimientos de Hna. Mabel" })
    ).toHaveAttribute("href", "/movements?search=Hna.%20Mabel&movement_type=INCOME")
    fireEvent.keyDown(dialog, { key: "Escape" })
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("opens the dialog for the unnamed tither without a movements link", () => {
    render(<TithersTable tithers={tithers} year={2026} />)
    fireEvent.click(screen.getByText("Sin nombre"))
    const dialog = screen.getByRole("dialog", { name: /Sin nombre/ })
    expect(within(dialog).queryByRole("link")).not.toBeInTheDocument()
  })
})
