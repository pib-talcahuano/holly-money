import { render, screen, fireEvent } from "@testing-library/react"
import { RoleMultiSelect, toggleRole } from "../role-multi-select"

describe("toggleRole", () => {
  it("adds a role", () => {
    expect(toggleRole(["BURSAR"], "MINISTER")).toEqual(["BURSAR", "MINISTER"])
  })

  it("removes a selected role", () => {
    expect(toggleRole(["BURSAR", "MINISTER"], "BURSAR")).toEqual(["MINISTER"])
  })

  it("ADMIN replaces everything", () => {
    expect(toggleRole(["BURSAR", "MINISTER"], "ADMIN")).toEqual(["ADMIN"])
  })

  it("picking another role clears ADMIN", () => {
    expect(toggleRole(["ADMIN"], "BURSAR")).toEqual(["BURSAR"])
  })
})

describe("RoleMultiSelect", () => {
  it("reports the new selection when a box is checked", () => {
    const onChange = jest.fn()
    render(<RoleMultiSelect id="roles" value={["BURSAR"]} onChange={onChange} />)

    fireEvent.click(screen.getByLabelText(/Ministro/))

    expect(onChange).toHaveBeenCalledWith(["BURSAR", "MINISTER"])
  })

  it("reflects the current selection", () => {
    render(<RoleMultiSelect id="roles" value={["BURSAR", "MINISTER"]} onChange={jest.fn()} />)

    expect(screen.getByLabelText(/Tesorero/)).toBeChecked()
    expect(screen.getByLabelText(/Ministro/)).toBeChecked()
    expect(screen.getByLabelText(/Finanzas/)).not.toBeChecked()
  })
})
