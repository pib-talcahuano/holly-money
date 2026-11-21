import { render, screen } from "@testing-library/react"
import { LateRegistrationBadge } from "../late-registration-badge"

describe("LateRegistrationBadge", () => {
  it("shows the late registration text with the day count", () => {
    render(<LateRegistrationBadge days={45} />)
    expect(screen.getByText("Registrado tarde · 45 d")).toBeInTheDocument()
  })

  it("exposes a descriptive title", () => {
    render(<LateRegistrationBadge days={45} />)
    expect(screen.getByText("Registrado tarde · 45 d")).toHaveAttribute(
      "title",
      "Registrado 45 días después de la fecha del movimiento"
    )
  })

  it("applies an extra className", () => {
    render(<LateRegistrationBadge days={45} className="extra-class" />)
    expect(screen.getByText("Registrado tarde · 45 d")).toHaveClass("extra-class")
  })
})
