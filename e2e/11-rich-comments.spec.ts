import { test, expect, chromium, type Locator, type Page } from "@playwright/test"
import { shot, login } from "./fixtures/helpers"

test.setTimeout(120_000)

async function createAndSubmitIntention(page: Page, purpose: string) {
  await page.goto("/requests", { waitUntil: "networkidle" })
  await page.getByRole("button", { name: "Nueva solicitud" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.locator("#int-amount").fill("10000")
  await dialog.locator("#int-purpose").fill(purpose)
  await dialog.locator("#int-funding-method").selectOption("TRANSFER")
  await page.getByRole("button", { name: "Enviar solicitud" }).click()
  await expect(page.getByText("Solicitud enviada al equipo de tesorería")).toBeVisible({
    timeout: 10_000
  })
}

// WCAG contrast ratio between an element's text color and its effective background.
// Colors are resolved through a canvas so any CSS syntax the browser returns
// (oklab/color-mix/srgb, as Tailwind v4 emits) becomes plain RGBA, and
// semi-transparent backgrounds are composited down the ancestor chain.
async function contrastRatio(locator: Locator, which: "color" | "placeholder" = "color") {
  return locator.evaluate((el, target) => {
    const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!
    const rgba = (css: string) => {
      ctx.clearRect(0, 0, 1, 1)
      ctx.fillStyle = "#000"
      ctx.fillStyle = css
      ctx.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
      return { r, g, b, a: a / 255 }
    }
    const lum = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const f = (v: number) => {
        const x = v / 255
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const layers: string[] = []
    for (let n: Element | null = el; n; n = n.parentElement) {
      layers.unshift(getComputedStyle(n).backgroundColor)
    }
    let bg = { r: 255, g: 255, b: 255 }
    for (const layer of layers) {
      const c = rgba(layer)
      bg = {
        r: c.r * c.a + bg.r * (1 - c.a),
        g: c.g * c.a + bg.g * (1 - c.a),
        b: c.b * c.a + bg.b * (1 - c.a)
      }
    }
    const style = target === "placeholder" ? getComputedStyle(el, "::before") : getComputedStyle(el)
    const fgRaw = rgba(style.color)
    const fg = {
      r: fgRaw.r * fgRaw.a + bg.r * (1 - fgRaw.a),
      g: fgRaw.g * fgRaw.a + bg.g * (1 - fgRaw.a),
      b: fgRaw.b * fgRaw.a + bg.b * (1 - fgRaw.a)
    }
    const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
  }, which)
}

// Theme switches animate colors (Button has transition-colors), so poll until settled.
async function expectContrast(locator: Locator, min: number, which?: "color" | "placeholder") {
  await expect
    .poll(() => contrastRatio(locator, which), { timeout: 3_000 })
    .toBeGreaterThanOrEqual(min)
}

test("request comments use a rich text editor and render formatted", async () => {
  const browser = await chromium.launch()
  const minister = await (await browser.newContext()).newPage()
  const bursar = await (await browser.newContext()).newPage()
  await login(minister, "minister")
  await login(bursar, "bursar")

  const purpose = "E2E comentarios " + Date.now()
  await createAndSubmitIntention(minister, purpose)

  await bursar.goto("/requests", { waitUntil: "networkidle" })
  await bursar.getByText(purpose).click()
  await bursar.waitForURL(/\/requests\/[0-9a-f-]+/)

  const editor = bursar.locator(".tiptap")
  const send = bursar.getByRole("button", { name: "Comentar", exact: true })
  await expect(send).toBeDisabled()

  await editor.click()
  await bursar.getByRole("button", { name: "Negrita" }).click()
  await bursar.keyboard.type("Revisar monto")
  await bursar.getByRole("button", { name: "Negrita" }).click()
  await bursar.keyboard.type(" y adjuntar <script>alert(1)</script> cotización")
  await bursar.keyboard.press("Enter")
  await bursar.getByRole("button", { name: "Lista con viñetas" }).click()
  await bursar.keyboard.type("punto uno")
  await bursar.keyboard.press("Enter")
  await bursar.keyboard.type("punto dos")
  await shot(bursar, "11-rich-comments", "editor-filled", { fullPage: false })

  await expect(send).toBeEnabled()
  await send.click()

  const thread = bursar.getByRole("list", { name: "Conversación" })
  const bubbles = thread.locator('[data-slot="bubble-content"]')
  const comment = bubbles.filter({ hasText: "Revisar monto" })
  await expect(comment.locator("strong")).toHaveText("Revisar monto", { timeout: 10_000 })
  await expect(comment.locator("li")).toHaveCount(2)
  await expect(comment).toContainText("<script>alert(1)</script>")
  await expect(comment.locator("script")).toHaveCount(0)
  // Editor cleared after submit
  await expect(editor).toHaveText("")
  await expect(send).toBeDisabled()
  await expect(bursar.getByText("El comentario no puede estar vacío")).toHaveCount(0)

  // Bubble design: dated divider, author header (name + role chip), avatar, time + read
  // ticks, and the reviewer's bubble sits on the right side of the thread.
  await expect(thread.getByText(/^\d{2}-\d{2}-\d{4}$/)).toHaveCount(1)
  await expect(thread.getByText("E2E Bursar", { exact: true })).toHaveCount(1)
  await expect(thread.getByText("Tesorería", { exact: true })).toHaveCount(1)
  await expect(thread.getByText("EB", { exact: true })).toHaveCount(1)
  await expect(thread.getByText(/^\d{2}:\d{2}$/)).toHaveCount(1)
  const [threadBox, bubbleBox] = await Promise.all([thread.boundingBox(), comment.boundingBox()])
  // (the 32px avatar column + 10px gap sit to the right of the bubble)
  expect(bubbleBox!.x + bubbleBox!.width).toBeGreaterThan(threadBox!.x + threadBox!.width - 60)
  await shot(bursar, "11-rich-comments", "comment-rendered", { fullPage: false })

  // Ctrl/Cmd+Enter submits, and the minister sees the formatted comment too
  await editor.click()
  await bursar.keyboard.type("segundo comentario")
  await bursar.keyboard.press("ControlOrMeta+Enter")
  await expect(bursar.getByText("segundo comentario")).toBeVisible({ timeout: 10_000 })
  await expect(editor).toHaveText("")
  await expect(bursar.getByText("El comentario no puede estar vacío")).toHaveCount(0)

  // Consecutive messages by the same author form one run: a single header, avatar and
  // time (on the last bubble), and the first bubble's tail corner is the tight 6px one.
  await expect(bubbles).toHaveCount(2)
  await expect(thread.getByText("Tesorería", { exact: true })).toHaveCount(1)
  await expect(thread.getByText("EB", { exact: true })).toHaveCount(1)
  await expect(thread.getByText(/^\d{2}:\d{2}$/)).toHaveCount(1)
  await expect(bubbles.first()).toHaveCSS("border-bottom-right-radius", "6px")
  await expect(bubbles.last()).toHaveCSS("border-bottom-right-radius", "4px")

  // The minister sees the same thread; the reviewer side is on the right for everyone.
  await minister.goto(bursar.url(), { waitUntil: "networkidle" })
  const ministerThread = minister.getByRole("list", { name: "Conversación" })
  await expect(
    ministerThread.locator('[data-slot="bubble-content"] strong', { hasText: "Revisar monto" })
  ).toBeVisible()
  await expect(ministerThread.getByText("Tesorería", { exact: true })).toBeVisible()

  // --- Dark mode ---
  await bursar.getByRole("button", { name: "Cambiar tema" }).click()
  await expect(bursar.locator("html")).toHaveAttribute("data-theme", "dark")

  // Empty editor: placeholder + toolbar icons stay legible
  const emptyEditor = bursar.locator(".tiptap p.is-editor-empty")
  await expect(emptyEditor).toBeVisible()
  await expectContrast(emptyEditor, 4.5, "placeholder")
  const boldBtn = bursar.getByRole("button", { name: "Negrita" })
  await expectContrast(boldBtn.locator("svg"), 3)

  // Typed content, active toolbar state and link field
  await editor.click()
  await boldBtn.click()
  await bursar.keyboard.type("texto en oscuro")
  await expect(boldBtn).toHaveAttribute("aria-pressed", "true")
  await expectContrast(editor.locator("strong"), 4.5)
  // Select the typed text so the link is applied to it
  await bursar.keyboard.press("Shift+Home")
  await bursar.getByRole("button", { name: "Enlace" }).click()
  const linkInput = bursar.getByPlaceholder("https://...")
  await expect(linkInput).toBeVisible()
  await linkInput.fill("https://example.com")
  await expectContrast(linkInput, 4.5)
  await shot(bursar, "11-rich-comments", "editor-dark", { fullPage: false })
  await linkInput.press("Enter")
  await expect(linkInput).toBeHidden()
  await expect(editor.locator("a")).toHaveAttribute("href", "https://example.com")

  // Rendered comments (bold, list, link) are legible in dark mode
  const rendered = bubbles.filter({ hasText: "Revisar monto" })
  // Reviewer bubbles are white on the primary color (per the design): the dark-mode
  // primary gives ~3.3:1, so assert the 3:1 floor here rather than 4.5.
  await expectContrast(rendered.locator("strong"), 3)
  await expectContrast(rendered.locator("li").first(), 3)
  await shot(bursar, "11-rich-comments", "comment-rendered-dark", { fullPage: false })

  // The comment posted in dark mode renders as a link opening in a new tab
  await bursar.getByRole("button", { name: "Comentar", exact: true }).click()
  const link = bursar.getByRole("link", { name: "texto en oscuro" })
  await expect(link).toHaveAttribute("href", "https://example.com", { timeout: 10_000 })
  await expect(link).toHaveAttribute("target", "_blank")
  await expectContrast(link, 3)

  // Leave the shared local user in light mode
  await bursar.getByRole("button", { name: "Cambiar tema" }).click()
  await expect(bursar.locator("html")).not.toHaveAttribute("data-theme", "dark")

  await browser.close()
})
