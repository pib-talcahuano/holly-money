import { render, screen } from "@testing-library/react"
import { RoleCallouts, RolePermissionsPanel, RoleSummary } from "../role-guidance"

describe("RoleSummary", () => {
  it("joins roles in canonical order", () => {
    render(<RoleSummary roles={["MINISTER", "BURSAR"]} />)
    expect(screen.getByText("Tesorero + Ministro")).toBeInTheDocument()
  })

  it("says Ninguno when empty", () => {
    render(<RoleSummary roles={[]} />)
    expect(screen.getByText("Ninguno")).toBeInTheDocument()
  })
})

describe("RolePermissionsPanel", () => {
  it("renders nothing without roles", () => {
    const { container } = render(<RolePermissionsPanel roles={[]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("de-duplicates and counts permission lines across roles", () => {
    render(<RolePermissionsPanel roles={["BURSAR", "FINANCE"]} />)
    expect(screen.getByText("3 permisos")).toBeInTheDocument()
    expect(screen.getByText("Aprobar o rechazar solicitudes de fondos")).toBeInTheDocument()
  })
})

describe("RoleCallouts", () => {
  it("warns about full trust when Admin is picked", () => {
    render(<RoleCallouts roles={["ADMIN"]} />)
    expect(screen.getByText(/plena confianza/)).toBeInTheDocument()
  })

  it("warns about separation of duties for Ministro + Tesorero", () => {
    render(<RoleCallouts roles={["BURSAR", "MINISTER"]} />)
    expect(screen.getByText("Ministro y Tesorero a la vez")).toBeInTheDocument()
  })

  it("shows nothing for a single non-admin role", () => {
    const { container } = render(<RoleCallouts roles={["FINANCE"]} />)
    expect(container).toBeEmptyDOMElement()
  })
})
