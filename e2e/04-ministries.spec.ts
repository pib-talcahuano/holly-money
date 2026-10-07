import { test, expect } from "@playwright/test"
import { login, shot } from "./fixtures/helpers"
import { MINISTRY_ID } from "./fixtures/users"

test.describe("Ministries (ADMIN) + Remanente (Etapa 7)", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, "admin")
  })

  test("list page + new ministry dialog", async ({ page }) => {
    await page.goto("/ministries", { waitUntil: "networkidle" })
    await shot(page, "04-ministries", "list")

    await page.getByRole("button", { name: "Nuevo ministerio" }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    await shot(page, "04-ministries", "new-dialog")
  })

  test("detail page — assignment history + remanente section", async ({ page }) => {
    await page.goto(`/ministries/${MINISTRY_ID}`, { waitUntil: "networkidle" })
    await expect(page.getByRole("heading", { name: "Remanente" })).toBeVisible()
    await shot(page, "04-ministries", "detail")
  })

  test("detail page — edit dialog", async ({ page }) => {
    await page.goto(`/ministries/${MINISTRY_ID}`, { waitUntil: "networkidle" })
    await page.getByRole("button", { name: "Editar" }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog).toBeVisible()
    await shot(page, "04-ministries", "edit-dialog")
  })
})
