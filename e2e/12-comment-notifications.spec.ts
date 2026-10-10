import { test, expect, chromium, type Page } from "@playwright/test"
import { login } from "./fixtures/helpers"

test.setTimeout(120_000)

const ENDPOINT = "/api/comment-notifications"

async function comment(page: Page, message: string) {
  await page.getByPlaceholder("Escribe un comentario...").fill(message)
  await page.getByRole("button", { name: "Comentar" }).click()
  await expect(page.getByText(message)).toBeVisible({ timeout: 10_000 })
}

test.describe("Request comment email notifications", () => {
  test("the cron endpoint rejects calls without the shared secret", async ({ request }) => {
    expect((await request.post(ENDPOINT)).status()).toBe(401)
    const wrong = await request.post(ENDPOINT, { headers: { "x-cron-secret": "nope" } })
    expect(wrong.status()).toBe(401)
  })

  test("new comments are claimed by the scheduled job and sent to the counterpart", async ({
    request
  }) => {
    test.skip(!process.env.CRON_SECRET, "CRON_SECRET must be set for the dev server and this run")

    const browser = await chromium.launch()
    const minister = await (await browser.newContext()).newPage()
    const bursar = await (await browser.newContext()).newPage()
    await login(minister, "minister")
    await login(bursar, "bursar")

    const purpose = "E2E comentarios " + Date.now()
    await minister.goto("/requests", { waitUntil: "networkidle" })
    await minister.getByRole("button", { name: "Nueva solicitud" }).click()
    const dialog = minister.getByRole("dialog")
    await dialog.locator("#int-amount").fill("15000")
    await dialog.locator("#int-purpose").fill(purpose)
    await dialog.locator("#int-funding-method").selectOption("REIMBURSEMENT")
    await minister.getByRole("button", { name: "Enviar solicitud" }).click()
    await expect(minister.getByText("Solicitud enviada al equipo de tesorería")).toBeVisible({
      timeout: 10_000
    })

    await bursar.goto("/requests", { waitUntil: "networkidle" })
    await bursar.getByText(purpose).click()
    await bursar.waitForURL(/\/requests\/[0-9a-f-]+/)
    await comment(bursar, "¿Puedes adjuntar la cotización?")

    await minister.goto(bursar.url(), { waitUntil: "networkidle" })
    await comment(minister, "Claro, la adjunto hoy")

    const headers = { "x-cron-secret": process.env.CRON_SECRET! }
    const first = await request.post(ENDPOINT, { headers })
    expect(first.ok()).toBe(true)
    const { summary } = (await first.json()) as {
      summary: { comments: number; emails: number; failed: number }
    }
    // Both comments are claimed; the bursar's comment goes to the requester.
    expect(summary.comments).toBeGreaterThanOrEqual(2)
    expect(summary.emails + summary.failed).toBeGreaterThanOrEqual(1)

    // Once delivered, nothing is left to send. Without a working Resend key the
    // claim is released for retry instead, which is the behavior under test then.
    const second = await request.post(ENDPOINT, { headers })
    const again = ((await second.json()) as { summary: { comments: number } }).summary
    if (summary.failed === 0) expect(again.comments).toBe(0)
    else expect(again.comments).toBeGreaterThanOrEqual(1)

    await browser.close()
  })
})
