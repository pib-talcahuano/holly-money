import { fireEvent, render, screen, waitFor } from "@testing-library/react"

const mockUpsertSubItem = jest.fn()
const mockRefresh = jest.fn()

jest.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }))
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }))
jest.mock("@/app/actions/budget-sub-items", () => ({
  upsertSubItem: (...args: unknown[]) => mockUpsertSubItem(...args),
  setSubItemActive: jest.fn()
}))
jest.mock("@/app/actions/ministry-budgets", () => ({ upsertMinistryBudget: jest.fn() }))

import { SubItemDialog, type SubItemParentRef } from "../sub-item-dialog"

const parent: SubItemParentRef = {
  kind: "ministry",
  ministryId: "m1",
  periodId: "p1",
  ministryBudgetId: "mb1",
  name: "Alfa"
}
const MESSAGE = "El total de este ministerio pasará a ser la suma de sus sub-ítems"

function setup(open: boolean, confirmMessage: string | null) {
  const onOpenChange = jest.fn()
  const ui = (isOpen: boolean, message: string | null) => (
    <SubItemDialog
      open={isOpen}
      onOpenChange={onOpenChange}
      parent={parent}
      categories={[]}
      subItem={null}
      confirmMessage={message}
    />
  )
  const view = render(ui(open, confirmMessage))
  return { onOpenChange, rerender: (o: boolean, m: string | null) => view.rerender(ui(o, m)) }
}

describe("SubItemDialog confirmation", () => {
  beforeEach(() => jest.clearAllMocks())

  it("does not bring a finished confirmation back the next time it opens", async () => {
    mockUpsertSubItem.mockResolvedValue({ id: "s1" })
    const { onOpenChange, rerender } = setup(true, MESSAGE)

    fireEvent.change(screen.getByLabelText("Nombre *"), { target: { value: "Niños" } })
    fireEvent.change(screen.getByLabelText("Asignado *"), { target: { value: "300" } })
    fireEvent.click(screen.getByRole("button", { name: "Guardar sub-ítem" }))
    expect(await screen.findByText(MESSAGE)).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Continuar" }))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(mockUpsertSubItem).toHaveBeenCalledTimes(1)

    // Parent closes and reopens the same mounted dialog, now for a parent without confirmation.
    rerender(false, MESSAGE)
    rerender(true, null)
    expect(screen.queryByText(MESSAGE)).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Continuar" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Guardar sub-ítem" })).toBeInTheDocument()
  })
})
