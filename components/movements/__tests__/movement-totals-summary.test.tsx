import { render, screen } from "@testing-library/react"
import { MovementTotalsSummary } from "../movement-totals-summary"
import type { MovementTotals } from "@/types/movement-totals"

const totals: MovementTotals = {
  income: { total: 485000, count: 14 },
  expense: { total: 12400, count: 1 },
  net: 472600
}

const caption = (n: number) =>
  n === 1
    ? "Suma de la 1 coincidencia de todo el historial, no solo de esta página. Los movimientos anulados no suman."
    : `Suma de las ${n} coincidencias de todo el historial, no solo de esta página. Los movimientos anulados no suman.`

describe("MovementTotalsSummary", () => {
  it("shows the three cards and the caption for ALL", () => {
    render(<MovementTotalsSummary totals={totals} movementType="ALL" />)
    expect(screen.getByText("Ingresos")).toBeInTheDocument()
    expect(screen.getByText("$485.000")).toBeInTheDocument()
    expect(screen.getByText("14 registros")).toBeInTheDocument()
    expect(screen.getByText("Egresos")).toBeInTheDocument()
    expect(screen.getByText("$12.400")).toBeInTheDocument()
    expect(screen.getByText("1 registro")).toBeInTheDocument()
    expect(screen.getByText("Neto")).toBeInTheDocument()
    expect(screen.getByText("$472.600")).toBeInTheDocument()
    expect(screen.getByText("Ingresos menos egresos")).toBeInTheDocument()
    expect(screen.getByText(caption(15))).toBeInTheDocument()
  })

  it("shows only income for INCOME", () => {
    render(<MovementTotalsSummary totals={totals} movementType="INCOME" />)
    expect(screen.getByText("Ingresos")).toBeInTheDocument()
    expect(screen.queryByText("Egresos")).not.toBeInTheDocument()
    expect(screen.queryByText("Neto")).not.toBeInTheDocument()
    expect(screen.getByText(caption(14))).toBeInTheDocument()
  })

  it("shows only expense for EXPENSE", () => {
    render(<MovementTotalsSummary totals={totals} movementType="EXPENSE" />)
    expect(screen.getByText("Egresos")).toBeInTheDocument()
    expect(screen.getByText("1 registro")).toBeInTheDocument()
    expect(screen.queryByText("Ingresos")).not.toBeInTheDocument()
    expect(screen.queryByText("Neto")).not.toBeInTheDocument()
    expect(screen.getByText(caption(1))).toBeInTheDocument()
  })

  it("renders nothing when there are no records", () => {
    const { container } = render(
      <MovementTotalsSummary
        totals={{ income: { total: 0, count: 0 }, expense: { total: 0, count: 0 }, net: 0 }}
        movementType="ALL"
      />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("exposes an accessible region", () => {
    render(<MovementTotalsSummary totals={totals} movementType="ALL" />)
    expect(screen.getByLabelText("Totales de la búsqueda")).toBeInTheDocument()
  })
})
