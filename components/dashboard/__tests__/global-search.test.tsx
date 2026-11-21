import { act, fireEvent, render, screen } from "@testing-library/react"
import { GlobalSearch } from "../global-search"
import { searchMovements } from "@/app/actions/movements"
import type { MovementSearchResult } from "@/app/actions/movements"

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
  searchMock.mockResolvedValue([])
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
    searchMock.mockResolvedValue([income, expense])
    const input = openDialog()
    await type(input, "ma")
    expect(screen.getByText("Ingresos")).toBeInTheDocument()
    expect(screen.getByText("Egresos")).toBeInTheDocument()
    expect(screen.getByText(/Diezmos/)).toBeInTheDocument()
  })

  it("marks cancelled movements", async () => {
    searchMock.mockResolvedValue([{ ...income, status: "CANCELLED" }])
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
    let resolveOld: (v: MovementSearchResult[]) => void = () => {}
    searchMock
      .mockImplementationOnce(() => new Promise((r) => (resolveOld = r)))
      .mockResolvedValueOnce([expense])
    const input = openDialog()
    await type(input, "ma")
    await type(input, "mab")
    await act(async () => {
      resolveOld([income])
    })
    expect(screen.getByText(/Gastos básicos/)).toBeInTheDocument()
    expect(screen.queryByText(/Diezmos/)).not.toBeInTheDocument()
  })

  it("navigates to the movement when a result is chosen", async () => {
    searchMock.mockResolvedValue([income])
    const input = openDialog()
    await type(input, "ma")
    fireEvent.click(screen.getByText(/Diezmos/))
    expect(mockPush).toHaveBeenCalledWith("/movements/m1")
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument()
  })

  it("navigates to the full list from the footer", async () => {
    searchMock.mockResolvedValue([income])
    const input = openDialog()
    await type(input, "mabel s")
    fireEvent.click(screen.getByText("Ver todos los resultados"))
    expect(mockPush).toHaveBeenCalledWith("/movements?search=mabel%20s")
  })
})
