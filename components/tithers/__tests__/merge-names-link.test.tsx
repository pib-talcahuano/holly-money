import { render, screen } from "@testing-library/react"
import { MergeNamesLink } from "../merge-names-link"

describe("MergeNamesLink", () => {
  it("links to the people page for income names", () => {
    render(<MergeNamesLink />)
    expect(screen.getByRole("button", { name: "Unir nombres" })).toHaveAttribute(
      "href",
      "/people?type=INCOME"
    )
  })
})
