import { renderToStaticMarkup } from "react-dom/server"

import { RichText } from "../rich-text"

const render = (md: string) => renderToStaticMarkup(<RichText>{md}</RichText>)

describe("RichText", () => {
  it("renders markdown formatting", () => {
    const html = render("**negrita** y *cursiva*\n\n- a\n- b")
    expect(html).toContain("<strong>negrita</strong>")
    expect(html).toContain("<em>cursiva</em>")
    expect(html).toContain("<li>a</li>")
  })

  it("keeps single newlines of legacy plain-text comments", () => {
    expect(render("línea 1\nlínea 2")).toContain("<br/>")
  })

  it("does not render raw HTML", () => {
    const html = render('<script>alert(1)</script><img src=x onerror="alert(1)">hola')
    expect(html).not.toContain("<script")
    expect(html).not.toContain("<img")
    expect(html).not.toContain("onerror=\"")
  })

  it("drops javascript: links and opens safe links in a new tab", () => {
    expect(render("[x](javascript:alert(1))")).not.toContain("javascript:")
    const html = render("[ok](https://example.com)")
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain("noopener")
  })

  it("disallows images and headings", () => {
    const html = render("![alt](https://example.com/a.png)\n\n# Título")
    expect(html).not.toContain("<img")
    expect(html).not.toContain("<h1")
  })
})
