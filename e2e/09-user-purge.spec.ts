import { test, expect } from "@playwright/test"
import { createClient } from "@supabase/supabase-js"
import fs from "node:fs"
import { login, shot } from "./fixtures/helpers"

// Seeds its own throwaway user (+ one movement) with the local service key, so it never touches
// the seeded e2e users and needs no db reset. Reads .env.local/.env because Playwright doesn't load it.
function env(name: string) {
  // .env.local wins over .env, same precedence as Next.
  for (const file of [".env.local", ".env"]) {
    const line = fs
      .readFileSync(file, "utf8")
      .split("\n")
      .find((l) => l.startsWith(`${name}=`))
    if (line) return line.slice(name.length + 1).replace(/^"|"$/g, "")
  }
  return ""
}

const admin = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SECRET_KEY"))

test.describe("Permanent user purge (ADMIN)", () => {
  let userId = ""
  const email = `e2e-purge-${Date.now()}@local.test`

  test.beforeAll(async () => {
    const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true })
    expect(error).toBeNull()
    userId = data.user!.id
    await admin
      .from("users")
      .insert({ id: userId, full_name: "Purge E2E", email, role: "FINANCE", status: "ACTIVE" })
    const { data: category } = await admin
      .from("movement_categories")
      .select("id")
      .limit(1)
      .single()
    const { error: movementError } = await admin.from("movements").insert({
      movement_date: "2099-01-01",
      movement_type: "EXPENSE",
      amount: 1234,
      created_by_id: userId,
      category_id: category!.id
    })
    expect(movementError).toBeNull()
  })

  test.afterAll(async () => {
    await admin.rpc("purge_user", { p_user_id: userId }) // no-op error if the test already purged
  })

  test("previews the impact, gates on the email, then purges everything", async ({ page }) => {
    await login(page, "admin")
    await page.goto("/users", { waitUntil: "networkidle" })

    await page
      .getByText(email)
      .locator("xpath=ancestor::*[.//button[@title='Editar usuario']][1]")
      .getByTitle("Editar usuario")
      .click()
    await page.getByRole("button", { name: "Eliminar usuario" }).click()
    await page.getByLabel(/Eliminar permanentemente/).check()

    const dialog = page.getByRole("dialog")
    await expect(dialog.getByText("Se eliminará permanentemente:")).toBeVisible()
    await expect(dialog.getByText("Movimientos: 1")).toBeVisible()
    await shot(page, "09-user-purge", "purge-preview")

    const confirm = dialog.getByRole("button", { name: "Sí, eliminar permanentemente" })
    await expect(confirm).toBeDisabled()
    await dialog.locator("input[type=text]").fill("wrong@local.test")
    await expect(confirm).toBeDisabled()
    await dialog.locator("input[type=text]").fill(email)
    await expect(confirm).toBeEnabled()

    await confirm.click()
    await expect(page.getByText("Purge E2E fue eliminado")).toBeVisible()
    await expect(page.getByText(email)).toHaveCount(0)

    const { data: rows } = await admin.from("movements").select("id").eq("created_by_id", userId)
    expect(rows).toHaveLength(0)
    const { data: authUser } = await admin.auth.admin.getUserById(userId)
    expect(authUser.user).toBeNull()
  })
})
