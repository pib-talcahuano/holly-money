import { fireEvent, render, screen } from "@testing-library/react"
import type { PersonName } from "@/types/people"
import { PeopleTable } from "../people-table"

jest.mock("@/app/actions/people", () => ({
  previewPeopleMerge: jest.fn().mockResolvedValue({ ok: true, affected: 0 }),
  mergePeople: jest.fn()
}))
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }))
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: jest.fn() }) }))

const names: PersonName[] = [
  { name: "Hna. Mabel", count: 12, total: 240000, lastDate: "2026-11-12", sameAs: [] },
  { name: "Mabel", count: 4, total: 60000, lastDate: "2026-10-01", sameAs: [] },
  { name: "Juan Pérez", count: 9, total: 180000, lastDate: "2026-10-05", sameAs: [] },
  { name: "Pedro Soto", count: 4, total: 40000, lastDate: "2026-09-05", sameAs: [] },
  {
    name: "Pedro  soto",
    count: 1,
    total: 10000,
    lastDate: "2026-08-05",
    sameAs: ["Pedro Soto"]
  }
]

describe("PeopleTable", () => {
  it("shows names with counts, totals and dates", () => {
    render(<PeopleTable names={names} movementType="INCOME" />)
    expect(screen.getByText("Hna. Mabel")).toBeInTheDocument()
    expect(screen.getByText("12")).toBeInTheDocument()
    expect(screen.getByText("$240.000")).toBeInTheDocument()
    expect(screen.getByText("12-11-2026")).toBeInTheDocument()
  })

  it("shows the same-person badge next to the variant", () => {
    render(<PeopleTable names={names} movementType="INCOME" />)
    expect(screen.getAllByText("Misma persona, distinta escritura")).toHaveLength(1)
  })

  it("enables the merge button only with two or more selected", () => {
    render(<PeopleTable names={names} movementType="INCOME" />)
    const button = screen.getByRole("button", { name: /Unir seleccionados/ })
    expect(button).toBeDisabled()
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar Hna. Mabel" }))
    expect(button).toBeDisabled()
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar Mabel" }))
    expect(button).toBeEnabled()
    expect(button).toHaveTextContent("(2)")
  })

  it("filters ignoring accents and case", () => {
    render(<PeopleTable names={names} movementType="INCOME" />)
    fireEvent.change(screen.getByLabelText("Filtrar por nombre"), {
      target: { value: "juan perez" }
    })
    expect(screen.getByText("Juan Pérez")).toBeInTheDocument()
    expect(screen.queryByText("Hna. Mabel")).not.toBeInTheDocument()
  })

  it("shows empty states", () => {
    const { unmount } = render(<PeopleTable names={names} movementType="INCOME" />)
    fireEvent.change(screen.getByLabelText("Filtrar por nombre"), { target: { value: "zzz" } })
    expect(screen.getByText("Sin coincidencias.")).toBeInTheDocument()
    unmount()
    render(<PeopleTable names={[]} movementType="INCOME" />)
    expect(screen.getByText("No hay nombres para unir.")).toBeInTheDocument()
  })

  it("opens the rename dialog from the row link", async () => {
    render(<PeopleTable names={names} movementType="INCOME" />)
    fireEvent.click(screen.getByRole("button", { name: "Renombrar Juan Pérez" }))
    expect(await screen.findByRole("heading", { name: "Renombrar" })).toBeInTheDocument()
  })
})
