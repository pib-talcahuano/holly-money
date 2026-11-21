import { buildMovementSearchFilter, parseAmountTerm } from "@/lib/utils/movement-search"

const none = { categoryIds: [], subcategoryIds: [] }

describe("buildMovementSearchFilter", () => {
  it("searches delivered_by and notes for plain text", () => {
    const f = buildMovementSearchFilter("mabel", none)
    expect(f).toContain("delivered_by.ilike.%mabel%")
    expect(f).toContain("notes.ilike.%mabel%")
    expect(f).not.toContain("amount")
  })

  it("matches amounts with thousands dots", () => {
    expect(buildMovementSearchFilter("20.000", none)).toContain("amount.eq.20000")
  })

  it("matches plain digit amounts", () => {
    expect(buildMovementSearchFilter("15000", none)).toContain("amount.eq.15000")
  })

  it("skips amount for mixed letters and digits", () => {
    expect(buildMovementSearchFilter("mabel 2", none)).not.toContain("amount")
  })

  it("skips amount for malformed dotted numbers", () => {
    expect(buildMovementSearchFilter("20.00050", none)).not.toContain("amount")
    expect(buildMovementSearchFilter("1.5", none)).not.toContain("amount")
  })

  it("includes category and subcategory ids when present", () => {
    const f = buildMovementSearchFilter("x", { categoryIds: ["c1", "c2"], subcategoryIds: ["s1"] })
    expect(f).toContain("category_id.in.(c1,c2)")
    expect(f).toContain("subcategory_id.in.(s1)")
  })

  it("omits id conditions when there are no ids", () => {
    const f = buildMovementSearchFilter("x", none)
    expect(f).not.toContain("category_id")
    expect(f).not.toContain("subcategory_id")
  })

  it("returns null for empty text", () => {
    expect(buildMovementSearchFilter("", none)).toBeNull()
  })
})

describe("parseAmountTerm", () => {
  it("parses plain digits and thousands dots", () => {
    expect(parseAmountTerm("20.000")).toBe(20000)
    expect(parseAmountTerm("15000")).toBe(15000)
  })

  it("returns null for anything else", () => {
    for (const t of ["1.5", "20.00050", "mabel 2", ""]) expect(parseAmountTerm(t)).toBeNull()
  })
})
