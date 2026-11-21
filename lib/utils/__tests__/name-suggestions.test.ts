import {
  accentInsensitivePattern,
  groupNameSuggestions,
  normalizeName
} from "@/lib/utils/name-suggestions"

describe("normalizeName", () => {
  it("lowercases, strips accents and collapses spaces", () => {
    expect(normalizeName("  Hna.   MÁBEL ")).toBe("hna. mabel")
    expect(normalizeName("Peña")).toBe("pena")
    expect(normalizeName("   ")).toBe("")
  })
})

describe("groupNameSuggestions", () => {
  it("groups by normalized name using the most used spelling", () => {
    expect(
      groupNameSuggestions(["Hna. Mabel", "hna.  mabel", "Hna. Mabel", "Juan Pérez"], 8)
    ).toEqual([
      { name: "Hna. Mabel", count: 3 },
      { name: "Juan Pérez", count: 1 }
    ])
  })

  it("breaks spelling ties with the first (most recent) one", () => {
    expect(groupNameSuggestions(["Mabel", "mabel"], 8)).toEqual([{ name: "Mabel", count: 2 }])
  })

  it("keeps first-appearance order for equal counts", () => {
    expect(groupNameSuggestions(["Ana", "Beto"], 8).map((s) => s.name)).toEqual(["Ana", "Beto"])
  })

  it("orders by frequency", () => {
    expect(groupNameSuggestions(["Ana", "Beto", "Beto"], 8).map((s) => s.name)).toEqual([
      "Beto",
      "Ana"
    ])
  })

  it("respects limit", () => {
    expect(groupNameSuggestions(["Ana", "Beto", "Carla"], 2)).toHaveLength(2)
  })

  it("discards empty and whitespace-only names", () => {
    expect(groupNameSuggestions(["", "  ", "Ana"], 8)).toEqual([{ name: "Ana", count: 1 }])
  })
})

describe("accentInsensitivePattern", () => {
  it("replaces accent-prone letters with a single-char wildcard", () => {
    expect(accentInsensitivePattern("mabel")).toBe("m_b_l")
    expect(accentInsensitivePattern("Mábel")).toBe("m_b_l")
    expect(accentInsensitivePattern("Peña")).toBe("p___")
  })
})
