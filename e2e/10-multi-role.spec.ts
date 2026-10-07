import { test, expect, type Browser, type Page } from "@playwright/test"
import { createClient } from "@supabase/supabase-js"
import fs from "node:fs"
import { login } from "./fixtures/helpers"
import { MINISTRY_ID } from "./fixtures/users"

// Seeds its own throwaway multi-role user + ministry with the local service key, so it never
// touches the seeded e2e users/ministries and needs no db reset. Reads .env.local/.env because
// Playwright doesn't load them.
function env(name: string) {
  for (const file of [".env.local", ".env"]) {
    if (!fs.existsSync(file)) continue
    const line = fs
      .readFileSync(file, "utf8")
      .split("\n")
      .find((l) => l.startsWith(`${name}=`))
    if (line) return line.slice(name.length + 1).replace(/^"|"$/g, "")
  }
  return ""
}

const admin = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SECRET_KEY"), {
  auth: { autoRefreshToken: false, persistSession: false }
})

const stamp = Date.now()
const email = `e2e-multi-${stamp}@local.test`
const password = "Testing123!"
const ministryName = `Ministerio Multi E2E ${stamp}`

// Same hydration waits as helpers.login, for a user that isn't in the shared USERS fixture.
async function loginAs(page: Page, userEmail: string, userPassword: string) {
  await page.goto("/", { waitUntil: "networkidle" })
  const submit = page.getByRole("button", { name: "Ingresar" })
  await submit.waitFor({ state: "visible" })
  await page.waitForTimeout(500)
  await page.locator("#email").fill(userEmail)
  await page.locator("#password").fill(userPassword)
  await submit.click()
  await page.waitForURL(/\/dashboard/, { timeout: 15_000 })
}

function watchHealth(page: Page) {
  const pageErrors: string[] = []
  const serverErrors: string[] = []
  page.on("pageerror", (err) => pageErrors.push(err.message))
  page.on("response", (res) => {
    if (res.status() >= 500) serverErrors.push(`${res.status()} ${res.url()}`)
  })
  return {
    expectClean() {
      expect(pageErrors, "uncaught page errors").toEqual([])
      expect(serverErrors, "HTTP >= 500 responses").toEqual([])
    }
  }
}

async function freshPage(browser: Browser) {
  const context = await browser.newContext()
  return { context, page: await context.newPage() }
}

function userRow(page: Page, userEmail: string) {
  return page
    .getByText(userEmail)
    .first()
    .locator("xpath=ancestor::*[.//button[@title='Editar usuario']][1]")
}

test.describe("Multi-role users", () => {
  test.describe.configure({ mode: "serial" })

  let userId = ""
  let ministryId = ""

  test.beforeAll(async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    })
    expect(error).toBeNull()
    userId = data.user!.id
    const { error: userError } = await admin
      .from("users")
      .insert({ id: userId, full_name: "Multi E2E", email, roles: ["BURSAR"], status: "ACTIVE" })
    expect(userError).toBeNull()
    const { data: ministry, error: ministryError } = await admin
      .from("ministries")
      .insert({ name: ministryName })
      .select("id")
      .single()
    expect(ministryError).toBeNull()
    ministryId = (ministry as { id: string }).id
  })

  test.afterAll(async () => {
    if (ministryId) {
      await admin.from("ministry_assignments").delete().eq("ministry_id", ministryId)
      await admin.from("ministries").delete().eq("id", ministryId)
    }
    if (userId) {
      await admin.rpc("purge_user", { p_user_id: userId }) // tolerate "already gone"
      await admin.auth.admin.deleteUser(userId) // purge_user may leave/skip the auth row
    }
  })

  test("admin gives a user a second role", async ({ page }) => {
    await login(page, "admin")
    await page.goto("/users", { waitUntil: "networkidle" })

    await userRow(page, email).getByTitle("Editar usuario").click()
    const dialog = page.getByRole("dialog", { name: "Editar usuario" })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole("checkbox", { name: /^Tesorero/ })).toBeChecked()
    await dialog.getByRole("checkbox", { name: /^Ministro/ }).check()
    await dialog.getByRole("button", { name: "Guardar cambios" }).click()
    await expect(page.getByText("Usuario actualizado").first()).toBeVisible({ timeout: 10_000 })

    await page.goto("/users", { waitUntil: "networkidle" })
    const row = userRow(page, email)
    await expect(row.getByText("Tesorero", { exact: true })).toBeVisible()
    await expect(row.getByText("Ministro", { exact: true })).toBeVisible()

    const { data } = await admin.from("users").select("roles").eq("id", userId).single()
    expect([...(data!.roles as string[])].sort()).toEqual(["BURSAR", "MINISTER"])
  })

  test("ADMIN is exclusive and an empty selection is blocked", async ({ page }) => {
    await login(page, "admin")
    await page.goto("/users", { waitUntil: "networkidle" })

    await page.getByRole("button", { name: "Crear usuario" }).click()
    const dialog = page.getByRole("dialog", { name: "Crear usuario" })
    await expect(dialog).toBeVisible()
    const box = (name: RegExp) => dialog.getByRole("checkbox", { name })
    const adminBox = box(/^Admin/)
    const others = [box(/^Tesorero/), box(/^Finanzas/), box(/^Ministro/)]

    await adminBox.check()
    await expect(adminBox).toBeChecked()
    for (const other of others) await expect(other).not.toBeChecked()

    await box(/^Ministro/).check()
    await expect(box(/^Ministro/)).toBeChecked()
    await expect(adminBox).not.toBeChecked()

    await box(/^Ministro/).uncheck()
    for (const cb of [adminBox, ...others]) await expect(cb).not.toBeChecked()

    await dialog.locator("#new-full_name").fill("Nadie E2E")
    await dialog.locator("#new-email").fill(`e2e-nobody-${stamp}@local.test`)
    await dialog.getByRole("button", { name: /^Enviar/ }).click()
    await expect(dialog.getByText("Selecciona al menos un rol")).toBeVisible()

    await dialog.getByRole("button", { name: "Cancelar" }).click()
    const { data } = await admin.from("users").select("id").eq("email", `e2e-nobody-${stamp}@local.test`)
    expect(data).toHaveLength(0)
  })

  test("admin assigns the multi-role user to the throwaway ministry", async ({ page }) => {
    const health = watchHealth(page)
    await login(page, "admin")
    await page.goto("/ministries", { waitUntil: "networkidle" })
    await expect(page.getByRole("link", { name: "Ministerios", exact: true }).first()).toBeVisible()

    await page.getByText(ministryName).click()
    await page.waitForURL(new RegExp(`/ministries/${ministryId}`), { timeout: 10_000 })

    // The original bug: a BURSAR+MINISTER user was missing from this picker.
    const select = page.locator("select").filter({ hasText: "Seleccionar ministro" })
    await expect(select.locator("option", { hasText: "Multi E2E" })).toHaveCount(1)
    await select.selectOption({ label: `Multi E2E — ${email}` })
    await page.getByRole("button", { name: "Asignar", exact: true }).click()
    await expect(page.getByText("Ministro asignado").first()).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText("Multi E2E", { exact: true }).first()).toBeVisible()

    const { data } = await admin
      .from("ministry_assignments")
      .select("user_id")
      .eq("ministry_id", ministryId)
      .is("unassigned_at", null)
    expect(data?.map((r) => r.user_id)).toEqual([userId])
    health.expectClean()
  })

  test("the multi-role user's view", async ({ browser }) => {
    const { context, page } = await freshPage(browser)
    const health = watchHealth(page)
    await loginAs(page, email, password)

    const sidebar = page.locator("[data-slot=sidebar-content], [data-sidebar=content]").first()
    await expect(sidebar.getByRole("link", { name: "Presupuesto" })).toBeVisible()
    await expect(sidebar.getByRole("link", { name: "Solicitudes" })).toBeVisible()
    await expect(sidebar.getByRole("link", { name: "Remuneraciones" })).toBeVisible()
    await expect(sidebar.getByRole("link", { name: "Mi ministerio" })).toHaveAttribute(
      "href",
      `/ministries/${ministryId}`
    )
    // No link to the ministries list (ADMIN-only).
    await expect(sidebar.locator("a[href='/ministries']")).toHaveCount(0)

    await page.goto("/ministries", { waitUntil: "networkidle" })
    await expect(page).toHaveURL(/\/dashboard/)

    await page.goto("/budgets", { waitUntil: "networkidle" })
    await expect(page.getByRole("heading", { name: "Presupuesto", level: 1 })).toBeVisible()

    await page.goto(`/ministries/${ministryId}`, { waitUntil: "networkidle" })
    await expect(page).toHaveURL(new RegExp(`/ministries/${ministryId}`))
    await expect(page.getByText(ministryName).first()).toBeVisible()

    await page.goto(`/ministries/${MINISTRY_ID}`, { waitUntil: "networkidle" })
    await expect(page).toHaveURL(/\/dashboard/)

    // Reviewer view: a BURSAR who also holds MINISTER keeps the full workflow list rather than the
    // own-ministry-only minister view. Deterministic markers: the minister-mode header
    // ("Ministerio: <name>") and empty-state are absent, and the page lists requests from the
    // seeded e2e ministry, which are not the throwaway ministry's.
    await page.goto("/requests", { waitUntil: "networkidle" })
    await expect(page).toHaveURL(/\/requests$/)
    await expect(page.getByRole("heading", { name: "Solicitudes de Dinero" })).toBeVisible()
    await expect(page.getByText("No tienes un ministerio asignado")).toHaveCount(0)
    await expect(page.getByText("Crea tu primera solicitud")).toHaveCount(0)
    await expect(page.getByText(`Ministerio: ${ministryName}`)).toHaveCount(0)
    const { count } = await admin
      .from("budget_intentions")
      .select("id", { count: "exact", head: true })
      .eq("ministry_id", MINISTRY_ID)
    if ((count ?? 0) > 0) {
      await expect(page.getByText("Ministerio E2E").first()).toBeVisible()
    }

    health.expectClean()
    await context.close()
  })

  test("plain bursar (seeded)", async ({ page }) => {
    await login(page, "bursar")
    const sidebar = page.locator("[data-slot=sidebar-content], [data-sidebar=content]").first()
    await expect(sidebar.getByRole("link", { name: "Presupuesto" })).toBeVisible()
    await expect(sidebar.locator("a[href='/ministries']")).toHaveCount(0)

    await page.goto("/ministries", { waitUntil: "networkidle" })
    await expect(page).toHaveURL(/\/dashboard/)
    await page.goto("/budgets", { waitUntil: "networkidle" })
    await expect(page.getByRole("heading", { name: "Presupuesto", level: 1 })).toBeVisible()
  })

  test("plain minister (seeded)", async ({ page }) => {
    await login(page, "minister")
    const sidebar = page.locator("[data-slot=sidebar-content], [data-sidebar=content]").first()
    await expect(sidebar.getByRole("link", { name: "Presupuesto" })).toHaveCount(0)
    await expect(sidebar.locator("a[href='/ministries']")).toHaveCount(0)

    // /budgets bounces to /dashboard, which sends a plain minister on to their own ministry.
    await page.goto("/budgets", { waitUntil: "networkidle" })
    await expect(page).toHaveURL(new RegExp(`/ministries/${MINISTRY_ID}`))
    await expect(page.getByRole("heading", { name: "Presupuesto", level: 1 })).toHaveCount(0)
  })

  test("impersonation shows the role union", async ({ page }) => {
    const health = watchHealth(page)
    // A failure mid-flow can leave an unexpired session that blocks the next attempt.
    try {
      await login(page, "admin")
      await page.goto("/users", { waitUntil: "networkidle" })
      await userRow(page, email).getByTitle("Editar usuario").click()
      const dialog = page.getByRole("dialog", { name: "Editar usuario" })
      await dialog.getByRole("button", { name: "Impersonar" }).click()

      const banner = page.getByText(/Estás viendo la aplicación como/)
      await expect(banner).toBeVisible({ timeout: 10_000 })
      await expect(banner).toContainText("Tesorero · Ministro")
      health.expectClean()
    } finally {
      const exit = page.getByRole("button", { name: "Salir" })
      if (await exit.isVisible().catch(() => false)) {
        await exit.click()
        await expect(page.getByText(/Estás viendo la aplicación como/)).toHaveCount(0, {
          timeout: 10_000
        })
      }
    }
  })
})
