import {
  accentInsensitiveRegex,
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
    expect(groupNameSuggestions(["Ana", "Beto", "Carla"], 2).map((s) => s.name)).toEqual([
      "Ana",
      "Beto"
    ])
  })

  it("groups accent variants into one suggestion", () => {
    expect(groupNameSuggestions(["Mabel", "Mábel"], 8)).toEqual([{ name: "Mabel", count: 2 }])
  })

  it("discards empty and whitespace-only names", () => {
    expect(groupNameSuggestions(["", "  ", "Ana"], 8)).toEqual([{ name: "Ana", count: 1 }])
  })
})

describe("accentInsensitiveRegex", () => {
  it("expands accent-prone letters into character classes", () => {
    expect(accentInsensitiveRegex("ana")).toBe("[aáàâä][nñ][aáàâä]")
    expect(accentInsensitiveRegex("Mábel")).toBe("m[aáàâä]b[eéèêë]l")
    expect(accentInsensitiveRegex("Peña")).toBe("p[eéèêë][nñ][aáàâä]")
  })

  it("collapses whitespace runs into \\s+", () => {
    expect(accentInsensitiveRegex("hna.  mabel")).toBe("h[nñ][aáàâä]\\.\\s+m[aáàâä]b[eéèêë]l")
  })

  it("escapes regex metacharacters and keeps % and _ literal", () => {
    expect(accentInsensitiveRegex("a.b")).toBe("[aáàâä]\\.b")
    expect(accentInsensitiveRegex("50%")).toBe("50%")
    expect(accentInsensitiveRegex("x_y")).toBe("x_y")
    expect(accentInsensitiveRegex("*+?^${}|[]()\\")).toBe(
      "\\*\\+\\?\\^\\$\\{\\}\\|\\[\\]\\(\\)\\\\"
    )
  })
})
