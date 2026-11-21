import { fireEvent, render, screen, waitFor } from "@testing-library/react"

const mockCopy = jest.fn()
const mockRefresh = jest.fn()

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh, push: jest.fn() })
}))
jest.mock("sonner", () => ({ toast: { success: jest.fn(), error: jest.fn() } }))
jest.mock("@/app/actions/ministry-budgets", () => ({
  copyBudgetFromPeriod: (...args: unknown[]) => mockCopy(...args)
}))

import { BudgetCopyPanel } from "../budget-copy-panel"

const source = {
  period: { id: "p-src", year: 2025 },
  summary: [
    {
      ministry_id: "m1",
      ministry_name: "Alfa",
      period_id: "p-src",
      period_label: "2025",
      period_start_date: "2025-03-01",
      period_end_date: "2026-02-28",
      assigned_amount: 1000,
      initial_used_amount: 0,
      used_amount: 0,
      unassigned_used: 0,
      remaining: 1000
    }
  ],
  itemSummary: [],
  subItemSummary: []
}

function setup(onCopied: () => void) {
  render(
    <BudgetCopyPanel
      ministries={[{ id: "m1", name: "Alfa", is_active: true }]}
      targetPeriod={{ id: "p-dst", year: 2026 }}
      sourcePeriods={[{ id: "p-src", year: 2025 }]}
      source={source}
      onCopied={onCopied}
    />
  )
}

describe("BudgetCopyPanel", () => {
  beforeEach(() => jest.clearAllMocks())

  it("calls onCopied after a successful copy so the parent keeps the panel open", async () => {
    mockCopy.mockResolvedValue({
      copied: { ministry_budgets: 1, budget_items: 0, sub_items: 0 },
      skipped: { ministry_budgets: 0, budget_items: 0, sub_items: 0 }
    })
    const onCopied = jest.fn()
    setup(onCopied)

    fireEvent.click(screen.getByRole("button", { name: "Copiar Alfa" }))

    await waitFor(() => expect(onCopied).toHaveBeenCalledTimes(1))
    expect(mockCopy).toHaveBeenCalledWith({
      from_period_id: "p-src",
      to_period_id: "p-dst",
      scope: { ministry_id: "m1" }
    })
    expect(mockRefresh).toHaveBeenCalled()
  })

  it("does not call onCopied when the copy fails", async () => {
    mockCopy.mockRejectedValue(new Error("boom"))
    const onCopied = jest.fn()
    setup(onCopied)

    fireEvent.click(screen.getByRole("button", { name: "Copiar Alfa" }))

    await waitFor(() => expect(mockCopy).toHaveBeenCalled())
    expect(onCopied).not.toHaveBeenCalled()
  })
})
