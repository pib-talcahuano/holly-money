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
      expect(preview).toHaveBeenCalledWith({
        movement_type: "INCOME",
        from_names: ["Mabel"],
        to_name: "Mabel Rojas"
      })
    } finally {
      jest.useRealTimers()
    }
  })
})
