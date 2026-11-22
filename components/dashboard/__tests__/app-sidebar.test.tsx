import { getVisibleGroups } from "../app-sidebar"

function hrefs(roles: string[], ministryId?: string | null) {
  return getVisibleGroups(roles, ministryId).flatMap((g) => g.links.map((l) => l.href))
}

describe("getVisibleGroups", () => {
  it("shows Ministerios and Presupuesto to ADMIN", () => {
    const links = hrefs(["ADMIN"])
    expect(links).toContain("/ministries")
    expect(links).toContain("/budgets")
  })

  it("hides Ministerios from a bursar but keeps Presupuesto", () => {
    const links = hrefs(["BURSAR"])
    expect(links).not.toContain("/ministries")
    expect(links).toContain("/budgets")
  })

  it("gives a bursar+minister their own ministry, not the list", () => {
    const links = hrefs(["BURSAR", "MINISTER"], "m-1")
    expect(links).toContain("/ministries/m-1")
    expect(links).not.toContain("/ministries")
    expect(links).toContain("/budgets")
  })

  it("hides Mi ministerio when there is no assignment", () => {
    expect(hrefs(["BURSAR", "MINISTER"], null).some((h) => h.startsWith("/ministries/"))).toBe(
      false
    )
  })

  it("gives a plain minister neither Ministerios nor Presupuesto", () => {
    const links = hrefs(["MINISTER"], "m-1")
    expect(links).not.toContain("/ministries")
    expect(links).not.toContain("/budgets")
    expect(links).toContain("/ministries/m-1")
  })

  it.each(["ADMIN", "BURSAR", "FINANCE"])(
    "shows Diezmadores right after Movimientos to %s",
    (role) => {
      const finance = getVisibleGroups([role]).find((g) => g.label === "Finanzas")
      const links = finance?.links.map((l) => l.href) ?? []
      expect(links).toContain("/tithers")
      expect(links.indexOf("/tithers")).toBe(links.indexOf("/movements") + 1)
    }
  )

  it.each(["MINISTER", "DELEGATE"])("hides Diezmadores from %s", (role) => {
    expect(hrefs([role], "m-1")).not.toContain("/tithers")
  })
})
