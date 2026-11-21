import { render, screen } from "@testing-library/react"
import { MinistryBudgetBreakdown } from "../ministry-budget-breakdown"
import type { MinistryBudgetSummaryRow } from "@/services/ministries/ministry-budget.service"

const budget = (over: Partial<MinistryBudgetSummaryRow>) =>
  ({
    ministry_id: "m1",
    ministry_name: "Alfa",
    assigned_amount: 500,
    initial_used_amount: 10,
    used_amount: 280,
    unassigned_used: 150,
    remaining: 220,
    ...over
  }) as MinistryBudgetSummaryRow

const subItems = [{ id: "s1", name: "A", assigned_amount: 500, used_amount: 120, remaining: 380 }]

describe("MinistryBudgetBreakdown", () => {
  it("shows initial used and unassigned as their own lines so Usado adds up", () => {
    render(<MinistryBudgetBreakdown budget={budget({})} subItems={subItems} />)
    expect(screen.getByText("Usado inicial")).toBeInTheDocument()
    expect(screen.getByText("Sin asignar")).toBeInTheDocument()
  })

  it("omits the extra lines when they are zero", () => {
    render(
      <MinistryBudgetBreakdown
        budget={budget({ initial_used_amount: 0, unassigned_used: 0 })}
        subItems={subItems}
      />
    )
    expect(screen.queryByText("Usado inicial")).not.toBeInTheDocument()
    expect(screen.queryByText("Sin asignar")).not.toBeInTheDocument()
  })

  it("keeps the sign of a negative remaining in destructive style", () => {
    render(
      <MinistryBudgetBreakdown
        budget={budget({ remaining: -40 })}
        subItems={[{ ...subItems[0], remaining: -40 }]}
      />
    )
    for (const cell of screen.getAllByText(/-40/)) expect(cell).toHaveClass("text-destructive")
  })
})
