import { act, fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { DeliveredByAutocomplete } from "../delivered-by-autocomplete"
import { suggestDeliveredBy } from "@/app/actions/movements"

jest.mock("@/app/actions/movements", () => ({
  suggestDeliveredBy: jest.fn()
}))

const suggestMock = suggestDeliveredBy as jest.Mock

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
  suggestMock.mockReset()
  suggestMock.mockResolvedValue([])
})

afterEach(() => {
  jest.useRealTimers()
})

function Harness({
  initial = "",
  movementType = "INCOME",
  onChange,
  onBlur
}: {
  initial?: string
  movementType?: "INCOME" | "EXPENSE"
  onChange?: (v: string) => void
  onBlur?: () => void
}) {
  const [value, setValue] = useState(initial)
  return (
    <DeliveredByAutocomplete
      value={value}
      movementType={movementType}
      onChange={(v) => {
        setValue(v)
        onChange?.(v)
      }}
      onBlur={onBlur}
    />
  )
}

function getInput() {
  return screen.getByRole("combobox") as HTMLInputElement
}

async function type(value: string, advance = 250) {
  fireEvent.change(getInput(), { target: { value } })
  await act(async () => {
    jest.advanceTimersByTime(advance)
  })
}

describe("DeliveredByAutocomplete", () => {
  it("shows the stored value on mount without fetching", async () => {
    render(<Harness initial="Ana" />)
    expect(getInput().value).toBe("Ana")
    await act(async () => {
      jest.advanceTimersByTime(500)
    })
    expect(suggestMock).not.toHaveBeenCalled()
  })

  it("does not fetch for a single character", async () => {
    render(<Harness />)
    await type("m", 300)
    expect(suggestMock).not.toHaveBeenCalled()
  })

  it("debounces 250 ms and passes the movement type", async () => {
    render(<Harness />)
    fireEvent.change(getInput(), { target: { value: "mabel" } })
    await act(async () => {
      jest.advanceTimersByTime(249)
    })
    expect(suggestMock).not.toHaveBeenCalled()
    await act(async () => {
      jest.advanceTimersByTime(1)
    })
    expect(suggestMock).toHaveBeenCalledTimes(1)
    expect(suggestMock).toHaveBeenCalledWith("mabel", "INCOME")
  })

  it("uses EXPENSE when given", async () => {
    render(<Harness movementType="EXPENSE" />)
    await type("mabel")
    expect(suggestMock).toHaveBeenCalledWith("mabel", "EXPENSE")
  })

  it("renders suggestions that do not match the text, with counts", async () => {
    suggestMock.mockResolvedValue([
      { name: "Hna. Mabel", count: 12 },
      { name: "Mabel Pérez", count: 1 }
    ])
    render(<Harness />)
    await type("mab")
    expect(await screen.findByText("Hna. Mabel")).toBeInTheDocument()
    expect(screen.getByText("Mabel Pérez")).toBeInTheDocument()
    expect(screen.getByText("12 veces")).toBeInTheDocument()
    expect(screen.getByText("1 vez")).toBeInTheDocument()
  })

  it("choosing an option calls onChange with its name", async () => {
    suggestMock.mockResolvedValue([{ name: "Hna. Mabel", count: 12 }])
    const onChange = jest.fn()
    render(<Harness onChange={onChange} />)
    await type("mab")
    fireEvent.click(await screen.findByText("Hna. Mabel"))
    expect(onChange).toHaveBeenLastCalledWith("Hna. Mabel")
    expect(getInput().value).toBe("Hna. Mabel")
    await act(async () => {
      jest.advanceTimersByTime(500)
    })
    expect(suggestMock).toHaveBeenCalledTimes(1)
    expect(screen.queryByText("12 veces")).not.toBeInTheDocument()
  })

  it("keeps free text on blur", async () => {
    suggestMock.mockResolvedValue([{ name: "Hna. Mabel", count: 12 }])
    const onChange = jest.fn()
    const onBlur = jest.fn()
    render(<Harness onChange={onChange} onBlur={onBlur} />)
    await type("Nombre Nuevo")
    onChange.mockClear()
    fireEvent.blur(getInput())
    expect(onBlur).toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
    expect(getInput().value).toBe("Nombre Nuevo")
  })

  it("discards stale responses", async () => {
    let resolveOld: (v: unknown) => void = () => {}
    suggestMock.mockImplementationOnce(() => new Promise((r) => (resolveOld = r)))
    suggestMock.mockResolvedValueOnce([{ name: "Mabel Nueva", count: 2 }])
    render(<Harness />)
    await type("ma")
    await type("mab")
    expect(await screen.findByText("Mabel Nueva")).toBeInTheDocument()
    await act(async () => {
      resolveOld([{ name: "Marta Vieja", count: 9 }])
    })
    expect(screen.queryByText("Marta Vieja")).not.toBeInTheDocument()
    expect(screen.getByText("Mabel Nueva")).toBeInTheDocument()
  })

  it("stays usable and silent when the action rejects", async () => {
    suggestMock.mockRejectedValue(new Error("boom"))
    render(<Harness />)
    await type("mabel")
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(screen.queryByText(/error/i)).not.toBeInTheDocument()
    await type("mabel x")
    expect(getInput().value).toBe("mabel x")
  })
})
