import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { toast } from "sonner"
import { mergePeople, previewPeopleMerge } from "@/app/actions/people"
import type { PersonName } from "@/types/people"
import { MergeDialog } from "../merge-dialog"

jest.mock("@/app/actions/people", () => ({
  previewPeopleMerge: jest.fn(),
  mergePeople: jest.fn()
}))
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }))
const refresh = jest.fn()
jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))

const preview = previewPeopleMerge as jest.Mock
const merge = mergePeople as jest.Mock

const two: PersonName[] = [
  { name: "Hna. Mabel", count: 12, total: 240000, lastDate: "2026-11-12", sameAs: [] },
  { name: "Mabel", count: 4, total: 60000, lastDate: "2026-10-01", sameAs: [] }
]
const one: PersonName[] = [two[1]]

function setup(selected = two) {
  const onOpenChange = jest.fn()
  const onDone = jest.fn()
  render(
    <MergeDialog
      movementType="INCOME"
      selected={selected}
      open
      onOpenChange={onOpenChange}
      onDone={onDone}
    />
  )
  return { onOpenChange, onDone }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

beforeEach(() => {
  jest.clearAllMocks()
  preview.mockResolvedValue({ ok: true, affected: 4 })
})

describe("MergeDialog (merge)", () => {
  it("renders spellings that differ only by whitespace with their exact text", () => {
    const spaced: PersonName[] = [
      { name: "Ana  Pérez", count: 2, total: 0, lastDate: "2026-01-01", sameAs: [] },
      { name: "Ana Pérez ", count: 1, total: 0, lastDate: "2026-01-01", sameAs: [] }
    ]
    setup(spaced)
    const labels = screen.getAllByRole("radio").map((radio) => radio.closest("label")!)
    const spans = labels.slice(0, 2).map((label) => label.querySelector("span")!)
    expect(spans[0].firstChild?.textContent).toBe("Ana  Pérez")
    expect(spans[1].firstChild?.textContent).toBe("Ana Pérez ")
    expect(spans[0]).toHaveClass("whitespace-pre-wrap")
    expect(spans[1]).toHaveClass("whitespace-pre-wrap")
  })

  it("shows title and options, then previews the chosen name", async () => {
    setup()
    expect(screen.getByRole("heading", { name: "Unir nombres" })).toBeInTheDocument()
    expect(screen.getAllByRole("radio")).toHaveLength(3)
    expect(screen.getByRole("radio", { name: /Otro nombre…/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("radio", { name: /Hna\. Mabel/ }))
    expect(await screen.findByText("4 movimientos cambiarán de nombre.")).toBeInTheDocument()
    expect(preview).toHaveBeenCalledWith({
      movement_type: "INCOME",
      from_names: ["Hna. Mabel", "Mabel"],
      to_name: "Hna. Mabel"
    })
  })

  it("debounces the preview for a custom name by 250 ms", async () => {
    jest.useFakeTimers()
    try {
      setup()
      fireEvent.click(screen.getByRole("radio", { name: /Otro nombre…/ }))
      fireEvent.change(screen.getByLabelText("Nombre personalizado"), {
        target: { value: "Mabel Rojas" }
      })
      await act(async () => {
        jest.advanceTimersByTime(200)
      })
      expect(preview).not.toHaveBeenCalled()
      await act(async () => {
        jest.advanceTimersByTime(60)
      })
      expect(preview).toHaveBeenCalledWith({
        movement_type: "INCOME",
        from_names: ["Hna. Mabel", "Mabel"],
        to_name: "Mabel Rojas"
      })
    } finally {
      jest.useRealTimers()
    }
  })

  it("ignores a stale preview response", async () => {
    const first = deferred<{ ok: true; affected: number }>()
    preview.mockReturnValueOnce(first.promise)
    preview.mockResolvedValueOnce({ ok: true, affected: 4 })
    setup()
    fireEvent.click(screen.getByRole("radio", { name: /Hna\. Mabel/ }))
    fireEvent.click(screen.getByRole("radio", { name: /^Mabel/ }))
    expect(await screen.findByText("4 movimientos cambiarán de nombre.")).toBeInTheDocument()
    await act(async () => {
      first.resolve({ ok: true, affected: 99 })
    })
    expect(screen.queryByText(/99 movimientos/)).not.toBeInTheDocument()
    expect(screen.getByText("4 movimientos cambiarán de nombre.")).toBeInTheDocument()
  })

  it("disables confirm without a name and while previewing", async () => {
    const pending = deferred<{ ok: true; affected: number }>()
    preview.mockReturnValueOnce(pending.promise)
    setup()
    const confirm = screen.getByRole("button", { name: "Unir nombres" })
    expect(confirm).toBeDisabled()
    fireEvent.click(screen.getByRole("radio", { name: /Hna\. Mabel/ }))
    expect(confirm).toBeDisabled()
    await act(async () => {
      pending.resolve({ ok: true, affected: 4 })
    })
    await waitFor(() => expect(confirm).toBeEnabled())
  })

  it("shows the preview error and keeps confirm disabled", async () => {
    preview.mockResolvedValue({ ok: false, error: "Sin permisos para unir nombres" })
    setup()
    fireEvent.click(screen.getByRole("radio", { name: /Hna\. Mabel/ }))
    expect(await screen.findByText("Sin permisos para unir nombres")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Unir nombres" })).toBeDisabled()
  })

  it("merges once, toasts, refreshes, closes and calls onDone", async () => {
    const pending = deferred<{ ok: true; updated: number }>()
    merge.mockReturnValueOnce(pending.promise)
    const { onOpenChange, onDone } = setup()
    fireEvent.click(screen.getByRole("radio", { name: /Hna\. Mabel/ }))
    const confirm = screen.getByRole("button", { name: "Unir nombres" })
    await waitFor(() => expect(confirm).toBeEnabled())
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    expect(merge).toHaveBeenCalledTimes(1)
    expect(merge).toHaveBeenCalledWith({
      movement_type: "INCOME",
      from_names: ["Hna. Mabel", "Mabel"],
      to_name: "Hna. Mabel"
    })
    await act(async () => {
      pending.resolve({ ok: true, updated: 4 })
    })
    expect(toast.success).toHaveBeenCalledWith("4 movimientos actualizados")
    expect(refresh).toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onDone).toHaveBeenCalled()
  })

  it("shows an inline error on a failed merge, refreshes, stays open and allows retry", async () => {
    merge.mockResolvedValueOnce({ ok: false, error: "Falló la unión" })
    merge.mockResolvedValueOnce({ ok: true, updated: 4 })
    const { onOpenChange, onDone } = setup()
    fireEvent.click(screen.getByRole("radio", { name: /Hna\. Mabel/ }))
    const confirm = screen.getByRole("button", { name: "Unir nombres" })
    await waitFor(() => expect(confirm).toBeEnabled())
    fireEvent.click(confirm)
    expect(await screen.findByText("Falló la unión")).toBeInTheDocument()
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(onDone).not.toHaveBeenCalled()
    await waitFor(() => expect(confirm).toBeEnabled())
    fireEvent.click(confirm)
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(merge).toHaveBeenCalledTimes(2)
  })

  it("shows a generic inline error when the action throws", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {})
    merge.mockRejectedValueOnce(new Error("boom"))
    setup()
    fireEvent.click(screen.getByRole("radio", { name: /Hna\. Mabel/ }))
    const confirm = screen.getByRole("button", { name: "Unir nombres" })
    await waitFor(() => expect(confirm).toBeEnabled())
    fireEvent.click(confirm)
    expect(await screen.findByText("No se pudo completar la operación")).toBeInTheDocument()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe("MergeDialog (in-flight, normalization, polish)", () => {
  async function startPendingMerge() {
    const pending = deferred<{ ok: true; updated: number }>()
    merge.mockReturnValueOnce(pending.promise)
    const handlers = setup()
    fireEvent.click(screen.getByRole("radio", { name: /Hna\. Mabel/ }))
    const confirm = screen.getByRole("button", { name: "Unir nombres" })
    await waitFor(() => expect(confirm).toBeEnabled())
    return { pending, confirm, ...handlers }
  }

  it("ignores Escape and disables Cancel while a merge is pending, then closes once", async () => {
    const { pending, confirm, onOpenChange, onDone } = await startPendingMerge()
    fireEvent.click(confirm)
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })
    fireEvent.keyDown(document.body, { key: "Escape" })
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByRole("heading", { name: "Unir nombres" })).toBeInTheDocument()
    await act(async () => {
      pending.resolve({ ok: true, updated: 4 })
    })
    expect(onOpenChange).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it("calls mergePeople once even when two clicks land in the same batch", async () => {
    const { pending, confirm } = await startPendingMerge()
    act(() => {
      confirm.click()
      confirm.click()
    })
    expect(merge).toHaveBeenCalledTimes(1)
    await act(async () => {
      pending.resolve({ ok: true, updated: 4 })
    })
  })

  it("sends the normalized final name while keeping exact origin spellings", async () => {
    const messy: PersonName[] = [
      { name: " Hna.  Mabel ", count: 2, total: 1, lastDate: "2026-11-12", sameAs: [] },
      { name: "Mabel", count: 1, total: 1, lastDate: "2026-10-01", sameAs: [] }
    ]
    merge.mockResolvedValueOnce({ ok: true, updated: 3 })
    setup(messy)
    fireEvent.click(screen.getByRole("radio", { name: /Hna\./ }))
    expect(await screen.findByText("Nombre final: Hna. Mabel")).toBeInTheDocument()
    const expected = {
      movement_type: "INCOME",
      from_names: [" Hna.  Mabel ", "Mabel"],
      to_name: "Hna. Mabel"
    }
    expect(preview).toHaveBeenCalledWith(expected)
    const confirm = screen.getByRole("button", { name: "Unir nombres" })
    await waitFor(() => expect(confirm).toBeEnabled())
    fireEvent.click(confirm)
    await waitFor(() => expect(merge).toHaveBeenCalledWith(expected))
  })

  it("shows Calculando… while the preview is pending", async () => {
    const pending = deferred<{ ok: true; affected: number }>()
    preview.mockReturnValueOnce(pending.promise)
    setup()
    fireEvent.click(screen.getByRole("radio", { name: /Hna\. Mabel/ }))
    expect(screen.getByText("Calculando…")).toBeInTheDocument()
    await act(async () => {
      pending.resolve({ ok: true, affected: 4 })
    })
    expect(screen.queryByText("Calculando…")).not.toBeInTheDocument()
  })

  it("keeps persistent live regions", async () => {
    setup()
    expect(screen.getByRole("status")).toBeInTheDocument()
    expect(screen.getByRole("alert")).toBeInTheDocument()
  })

  it("shows a generic inline message when the preview throws", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {})
    preview.mockRejectedValueOnce(new Error("boom"))
    setup()
    fireEvent.click(screen.getByRole("radio", { name: /Hna\. Mabel/ }))
    expect(await screen.findByText("No se pudo completar la operación")).toBeInTheDocument()
    spy.mockRestore()
  })

  it("clears the inline merge error when the choice changes", async () => {
    merge.mockResolvedValueOnce({ ok: false, error: "Falló la unión" })
    setup()
    fireEvent.click(screen.getByRole("radio", { name: /Hna\. Mabel/ }))
    const confirm = screen.getByRole("button", { name: "Unir nombres" })
    await waitFor(() => expect(confirm).toBeEnabled())
    fireEvent.click(confirm)
    expect(await screen.findByText("Falló la unión")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("radio", { name: /^Mabel/ }))
    expect(screen.queryByText("Falló la unión")).not.toBeInTheDocument()
  })

  it("says there is nothing to change and keeps confirm disabled when affected is 0", async () => {
    preview.mockResolvedValue({ ok: true, affected: 0 })
    setup()
    fireEvent.click(screen.getByRole("radio", { name: /Hna\. Mabel/ }))
    expect(await screen.findByText("No hay movimientos para cambiar.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Unir nombres" })).toBeDisabled()
  })
})

describe("MergeDialog (rename)", () => {
  it("shows a single text field and previews only when the text changes", async () => {
    jest.useFakeTimers()
    try {
      setup(one)
      expect(screen.getByRole("heading", { name: "Renombrar" })).toBeInTheDocument()
      expect(screen.queryAllByRole("radio")).toHaveLength(0)
      const input = screen.getByLabelText("Nombre final")
      expect(input).toHaveValue("Mabel")
      await act(async () => {
        jest.advanceTimersByTime(300)
      })
      expect(preview).not.toHaveBeenCalled()
      fireEvent.change(input, { target: { value: "Mabel Rojas" } })
      await act(async () => {
        jest.advanceTimersByTime(260)
      })
      expect(preview).toHaveBeenCalledTimes(1)
      expect(preview).toHaveBeenCalledWith({
        movement_type: "INCOME",
        from_names: ["Mabel"],
        to_name: "Mabel Rojas"
      })
      expect(screen.getByRole("button", { name: "Renombrar" })).toBeInTheDocument()
    } finally {
      jest.useRealTimers()
    }
  })
})
