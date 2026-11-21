import { withCurrentFundOption } from "../fund-options"

const options = [
  { id: "a", name: "Fondo A" },
  { id: "b", name: "Fondo B" }
]

describe("withCurrentFundOption", () => {
  it("returns the options untouched when there is no current fund", () => {
    expect(withCurrentFundOption(options, null, null)).toBe(options)
  })

  it("returns the options untouched when the current fund is already among them", () => {
    expect(withCurrentFundOption(options, "a", "Fondo A")).toBe(options)
  })

  it("appends the current fund labelled as another period when it is missing", () => {
    expect(withCurrentFundOption(options, "z", "Fondo Z")).toEqual([
      ...options,
      { id: "z", name: "Fondo Z (otro período)" }
    ])
  })

  it("falls back to a generic name when the fund name is unknown", () => {
    expect(withCurrentFundOption(options, "z", null).at(-1)).toEqual({
      id: "z",
      name: "Fondo asignado (otro período)"
    })
  })
})
