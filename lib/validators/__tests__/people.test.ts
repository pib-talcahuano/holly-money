import { peopleMergeSchema } from "../people"

const valid = {
  movement_type: "INCOME",
  from_names: ["Mabel", "Hna. Mabel"],
  to_name: "Hna. Mabel"
}

describe("peopleMergeSchema", () => {
  it("accepts a valid input and normalizes to_name", () => {
    const result = peopleMergeSchema.parse({ ...valid, to_name: "  Hna.  Mabel " })
    expect(result.to_name).toBe("Hna. Mabel")
  })

  it("rejects empty from_names", () => {
    const result = peopleMergeSchema.safeParse({ ...valid, from_names: [] })
    expect(result.error?.issues[0].message).toBe("Elige al menos un nombre")
  })

  it("rejects an empty source name", () => {
    expect(peopleMergeSchema.safeParse({ ...valid, from_names: [""] }).success).toBe(false)
  })

  it("rejects more than 50 names", () => {
    const from_names = Array.from({ length: 51 }, (_, i) => `N${i}`)
    expect(peopleMergeSchema.safeParse({ ...valid, from_names }).success).toBe(false)
  })

  it("rejects empty or whitespace to_name", () => {
    for (const to_name of ["", "   "]) {
      const result = peopleMergeSchema.safeParse({ ...valid, to_name })
      expect(result.error?.issues[0].message).toBe("Escribe el nombre final")
    }
  })

  it("rejects to_name over 100 characters", () => {
    const result = peopleMergeSchema.safeParse({ ...valid, to_name: "a".repeat(101) })
    expect(result.error?.issues[0].message).toBe("El nombre final no puede superar 100 caracteres")
  })

  it("rejects an invalid movement_type", () => {
    expect(peopleMergeSchema.safeParse({ ...valid, movement_type: "X" }).success).toBe(false)
  })
})
