import { fireEvent, render, screen, within } from "@testing-library/react"
import { MovementsTable, type SerializedMovement } from "../movements-table"

jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn() }) }))
jest.mock("@/app/actions/movements", () => ({ cancelMovement: jest.fn() }))
jest.mock("sonner", () => ({ toast: { promise: jest.fn() } }))

const LATE_TEXT = "Registrado tarde · 75 d"

function makeRow(overrides: Partial<SerializedMovement> = {}): SerializedMovement {
  return {
    id: "m-1",
    movement_date: "2026-09-01",
    movement_type: "EXPENSE",
    amount: "10000",
    category_name: "Servicios",
    subcategory_name: null,
    delivered_by: null,
    receipt_email: null,
    payment_method_name: null,
    notes: null,
    cancellation_reason: null,
    status: "ACTIVE",
    created_by: { full_name: "Ana Pérez" },
    created_at: "2026-11-15T15:00:00Z",
    ...overrides
  }
}

describe("MovementsTable late registration", () => {
  it.each(["full", "compact"] as const)("shows the badge for a late row (%s)", (variant) => {
    render(<MovementsTable rows={[makeRow()]} canWrite={false} variant={variant} />)
    expect(screen.getAllByText(LATE_TEXT).length).toBeGreaterThan(0)
  })

  it("does not show the badge for an on-time row", () => {
    render(
      <MovementsTable
        rows={[makeRow({ movement_date: "2026-11-10" })]}
        canWrite={false}
        variant="full"
      />
    )
    expect(screen.queryByText(/Registrado tarde/)).not.toBeInTheDocument()
  })

  it("does not show the badge when created_at is omitted or null", () => {
    const omitted = makeRow({ id: "m-2" })
    delete omitted.created_at
    render(
      <MovementsTable
        rows={[omitted, makeRow({ id: "m-3", created_at: null })]}
        canWrite={false}
        variant="compact"
      />
    )
    expect(screen.queryByText(/Registrado tarde/)).not.toBeInTheDocument()
  })

  it("shows the Registro field in the detail dialog only for a late row", async () => {
    const { unmount } = render(
      <MovementsTable rows={[makeRow()]} canWrite={false} variant="full" />
    )
    fireEvent.click(screen.getAllByRole("row")[1])
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("Registro")).toBeInTheDocument()
    expect(within(dialog).getByText(LATE_TEXT)).toBeInTheDocument()
    unmount()

    render(
      <MovementsTable
        rows={[makeRow({ movement_date: "2026-11-10" })]}
        canWrite={false}
        variant="full"
      />
    )
    fireEvent.click(screen.getAllByRole("row")[1])
    const dialog2 = await screen.findByRole("dialog")
    expect(within(dialog2).queryByText("Registro")).not.toBeInTheDocument()
  })
})
