import { render, screen } from "@testing-library/react"
import { AuditDiff } from "../audit-diff"

describe("AuditDiff roles", () => {
  it("does not report an unchanged roles array as changed", () => {
    const { container } = render(
      <AuditDiff
        previous={{ roles: ["BURSAR", "MINISTER"], status: "ACTIVE" }}
        next={{ roles: ["BURSAR", "MINISTER"], status: "ACTIVE" }}
      />
    )

    expect(container).toBeEmptyDOMElement()
  })

  it("shows roles as Spanish labels, before and after", () => {
    render(
      <AuditDiff
        previous={{ roles: ["BURSAR"] }}
        next={{ roles: ["BURSAR", "MINISTER"] }}
      />
    )

    expect(screen.getByText("Roles:")).toBeInTheDocument()
    expect(screen.getByText("Tesorero")).toBeInTheDocument()
    expect(screen.getByText("Tesorero · Ministro")).toBeInTheDocument()
  })
})
