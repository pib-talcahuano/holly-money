import { act, fireEvent, render, screen } from "@testing-library/react"
import { GlobalSearch } from "../global-search"
import { searchMovements } from "@/app/actions/movements"
import type { MovementSearchResponse, MovementSearchResult } from "@/app/actions/movements"

const mockPush = jest.fn()
const mockCan = jest.fn()

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush })
}))
jest.mock("@/components/providers/user-provider", () => ({
  useUser: () => ({ can: mockCan })
}))
jest.mock("@/app/actions/movements", () => ({
  searchMovements: jest.fn()
}))

const searchMock = searchMovements as jest.Mock

const income: MovementSearchResult = {
  id: "m1",
  movement_date: "2026-03-10",
  movement_type: "INCOME",
  amount: 50000,
  status: "ACTIVE",
  category_name: "Diezmos",
  delivered_by: "Mabel Soto"
}
const expense: MovementSearchResult = {
  id: "m2",
  movement_date: "2026-03-11",
  movement_type: "EXPENSE",
  amount: 20000,
  status: "ACTIVE",
  category_name: "Gastos básicos",
  delivered_by: "Pedro"
}

const totals = {
  income: { total: 485000, count: 14 },
  expense: { total: 12400, count: 1 },
  net: 472600
}

function response(
  results: MovementSearchResult[],
  withTotals: MovementSearchResponse["totals"] = totals
): MovementSearchResponse {
  return { results, totals: withTotals }
}

beforeAll(() => {
  global.ResizeObserver = class {
    observe = jest.fn()
    unobserve = jest.fn()
    disconnect = jest.fn()
  } as unknown as typeof ResizeObserver
  Element.prototype.scrollIntoView = jest.fn()
})

beforeEach(() => {
  jest.useFakeTimers()
  mockCan.mockReturnValue(true)
  searchMock.mockReset()
  searchMock.mockResolvedValue({ results: [], totals: null })
  mockPush.mockReset()
})

afterEach(() => {
  jest.useRealTimers()
})

function openDialog() {
  render(<GlobalSearch />)
  fireEvent.keyDown(document, { key: "k", ctrlKey: true })
  return screen.getByRole("combobox", { name: "Buscar movimientos" })
}

async function type(input: HTMLElement, value: string, advance = 250) {
  fireEvent.change(input, { target: { value } })
  await act(async () => {
    jest.advanceTimersByTime(advance)
  })
}

describe("GlobalSearch", () => {
  it("renders nothing without VIEW_MOVEMENT", () => {
    mockCan.mockReturnValue(false)
    const { container } = render(<GlobalSearch />)
    expect(container).toBeEmptyDOMElement()
  })

  it("opens with ctrl+k", () => {
    const input = openDialog()
    expect(input).toBeInTheDocument()
  })

  it("has no heading while closed and a named dialog while open", () => {
    render(<GlobalSearch />)
    expect(screen.queryByRole("heading", { name: "Buscar movimientos" })).toBeNull()
    fireEvent.keyDown(document, { key: "k", ctrlKey: true })
    expect(screen.getByRole("dialog", { name: "Buscar movimientos" })).toBeInTheDocument()
  })

  it("opens from the header button", () => {
    render(<GlobalSearch />)
    fireEvent.click(screen.getByRole("button", { name: "Abrir buscador" }))
    expect(screen.getByRole("combobox", { name: "Buscar movimientos" })).toBeInTheDocument()
  })

  it("does not search with fewer than 2 characters and shows a hint", async () => {
    const input = openDialog()
    await type(input, "m", 300)
    expect(searchMock).not.toHaveBeenCalled()
    expect(screen.getByText("Escribe al menos 2 caracteres.")).toBeInTheDocument()
  })

  it("debounces the search by 250ms", async () => {
    const input = openDialog()
    await type(input, "mabel", 249)
    expect(searchMock).not.toHaveBeenCalled()
    await act(async () => {
      jest.advanceTimersByTime(1)
    })
    expect(searchMock).toHaveBeenCalledTimes(1)
    expect(searchMock).toHaveBeenCalledWith("mabel")
  })

  it("groups results into Ingresos and Egresos", async () => {
    searchMock.mockResolvedValue(response([income, expense]))
    const input = openDialog()
    await type(input, "ma")
    const headings = Array.from(document.querySelectorAll("[cmdk-group-heading]")).map(
      (el) => el.textContent
    )
    expect(headings).toEqual(["Ingresos", "Egresos"])
    expect(screen.getByText(/Diezmos/)).toBeInTheDocument()
  })

  it("marks cancelled movements", async () => {
    searchMock.mockResolvedValue(response([{ ...income, status: "CANCELLED" }]))
    const input = openDialog()
    await type(input, "ma")
    expect(screen.getByText("Anulado")).toBeInTheDocument()
  })

  it("shows an empty state", async () => {
    const input = openDialog()
    await type(input, "zz")
    expect(screen.getByText("Sin resultados")).toBeInTheDocument()
  })

  it("shows an error when the search fails", async () => {
    searchMock.mockRejectedValue(new Error("boom"))
    const input = openDialog()
    await type(input, "zz")
    expect(screen.getByText("No se pudo buscar")).toBeInTheDocument()
  })

  it("ignores stale responses", async () => {
    let resolveOld: (v: MovementSearchResponse) => void = () => {}
    searchMock
      .mockImplementationOnce(() => new Promise((r) => (resolveOld = r)))
      .mockResolvedValueOnce(response([expense]))
    const input = openDialog()
    await type(input, "ma")
    await type(input, "mab")
    await act(async () => {
      resolveOld(response([income]))
    })
    expect(screen.getByText(/Gastos básicos/)).toBeInTheDocument()
    expect(screen.queryByText(/Diezmos/)).not.toBeInTheDocument()
  })

  it("navigates to the movement when a result is chosen", async () => {
    searchMock.mockResolvedValue(response([income]))
    const input = openDialog()
    await type(input, "ma")
    fireEvent.click(screen.getByText(/Diezmos/))
    expect(mockPush).toHaveBeenCalledWith("/movements/m1")
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument()
  })

  it("navigates to the full list from the footer", async () => {
    searchMock.mockResolvedValue(response([income]))
    const input = openDialog()
    await type(input, "mabel s")
    fireEvent.click(screen.getByText("Ver todos los resultados"))
    expect(mockPush).toHaveBeenCalledWith("/movements?search=mabel%20s")
  })

  it("hides previous results while a new search is loading", async () => {
    searchMock
      .mockResolvedValueOnce(response([income]))
      .mockImplementationOnce(() => new Promise(() => {}))
    const input = openDialog()
    await type(input, "ma")
    expect(screen.getByText(/Diezmos/)).toBeInTheDocument()
    await type(input, "mab")
    expect(screen.getByText("Buscando…")).toBeInTheDocument()
    expect(screen.queryByText(/Diezmos/)).not.toBeInTheDocument()
    expect(screen.queryByText("Ver todos los resultados")).not.toBeInTheDocument()
  })

  it("hides the footer on error", async () => {
    searchMock.mockRejectedValue(new Error("boom"))
    const input = openDialog()
    await type(input, "zz")
    expect(screen.queryByText("Ver todos los resultados")).not.toBeInTheDocument()
  })

  it("selects the first result so Enter opens it, not the full list", async () => {
    searchMock.mockResolvedValue(response([income, expense]))
    const input = openDialog()
    await type(input, "ma")
    fireEvent.keyDown(input, { key: "Enter" })
    expect(mockPush).toHaveBeenCalledWith("/movements/m1")
    expect(mockPush).toHaveBeenCalledTimes(1)
  })

  it("shows the totals strip between the results and the footer", async () => {
    searchMock.mockResolvedValue(response([income, expense]))
    const input = openDialog()
    await type(input, "ma")
    const strip = screen.getByLabelText("Totales de la búsqueda")
    expect(strip).toHaveTextContent("Total histórico · 15 coincidencias")
    expect(strip).toHaveTextContent("Sin anulados")
    expect(strip).toHaveTextContent("Ingresos")
    expect(strip).toHaveTextContent("$485.000")
    expect(strip).toHaveTextContent("14 registros")
    expect(strip).toHaveTextContent("Egresos")
    expect(strip).toHaveTextContent("$12.400")
    expect(strip).toHaveTextContent("1 registro")
    expect(strip).not.toHaveTextContent("1 registros")
    expect(strip).toHaveTextContent("Neto")
    expect(strip).toHaveTextContent("$472.600")
    expect(strip).toHaveTextContent("Ing. menos egr.")
  })

  it("shows results without the strip when totals are null", async () => {
    searchMock.mockResolvedValue(response([income], null))
    const input = openDialog()
    await type(input, "ma")
    expect(screen.getByText(/Diezmos/)).toBeInTheDocument()
    expect(screen.queryByLabelText("Totales de la búsqueda")).not.toBeInTheDocument()
  })

  it("shows no strip for an empty list, while loading or on error", async () => {
    searchMock.mockResolvedValueOnce(response([], totals))
    const input = openDialog()
    await type(input, "zz")
    expect(screen.queryByLabelText("Totales de la búsqueda")).not.toBeInTheDocument()

    searchMock
      .mockResolvedValueOnce(response([income]))
      .mockImplementationOnce(() => new Promise(() => {}))
    await type(input, "ma")
    expect(screen.getByLabelText("Totales de la búsqueda")).toBeInTheDocument()
    await type(input, "mab")
    expect(screen.getByText("Buscando…")).toBeInTheDocument()
    expect(screen.queryByLabelText("Totales de la búsqueda")).not.toBeInTheDocument()

    searchMock.mockRejectedValueOnce(new Error("boom"))
    await type(input, "mabe")
    expect(screen.getByText("No se pudo buscar")).toBeInTheDocument()
    expect(screen.queryByLabelText("Totales de la búsqueda")).not.toBeInTheDocument()
  })

  it("keeps Enter on the first result when the strip is shown", async () => {
    searchMock.mockResolvedValue(response([income, expense]))
    const input = openDialog()
    await type(input, "ma")
    expect(screen.getByLabelText("Totales de la búsqueda")).toBeInTheDocument()
    fireEvent.keyDown(input, { key: "Enter" })
    expect(mockPush).toHaveBeenCalledWith("/movements/m1")
    expect(mockPush).toHaveBeenCalledTimes(1)
  })

  it("renders the strip outside the cmdk list", async () => {
    searchMock.mockResolvedValue(response([income, expense]))
    const input = openDialog()
    await type(input, "ma")
    const strip = screen.getByLabelText("Totales de la búsqueda")
    const list = document.querySelector("[cmdk-list]")
    expect(list).not.toBeNull()
    expect(list?.contains(strip)).toBe(false)
  })

  it("hides the strip when every hit is cancelled and counts are zero", async () => {
    const zero = { income: { total: 0, count: 0 }, expense: { total: 0, count: 0 }, net: 0 }
    searchMock.mockResolvedValue(response([{ ...income, status: "CANCELLED" }], zero))
    const input = openDialog()
    await type(input, "ma")
    expect(screen.getByText("Anulado")).toBeInTheDocument()
    expect(screen.queryByLabelText("Totales de la búsqueda")).not.toBeInTheDocument()
  })

  it("uses the singular for a single match", async () => {
    const one = { income: { total: 500, count: 1 }, expense: { total: 0, count: 0 }, net: 500 }
    searchMock.mockResolvedValue(response([income], one))
    const input = openDialog()
    await type(input, "ma")
    expect(screen.getByLabelText("Totales de la búsqueda")).toHaveTextContent(
      "Total histórico · 1 coincidencia"
    )
    expect(screen.getByLabelText("Totales de la búsqueda")).not.toHaveTextContent("1 coincidencias")
  })
})
