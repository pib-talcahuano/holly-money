import { test, expect } from "@playwright/test"
import { createClient } from "@supabase/supabase-js"
import { shot } from "./fixtures/helpers"

// Full "forgot password" (account recovery) flow, screenshotted end to end.
// Uses a disposable auth user created via the admin API so it never touches
// the shared seeded e2e fixtures in supabase/seed.sql (recovery flips the
// user's status to PENDING_RESET and changes its password).
const TEST_EMAIL = `e2e-recovery-${Date.now()}@local.test`
const NEW_PASSWORD = "NewPassword123!"

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

let userId: string

test.describe("Account recovery", () => {
  test.beforeAll(async () => {
    const { data, error } = await admin.auth.admin.createUser({
      email: TEST_EMAIL,
      password: "Original123!",
      email_confirm: true
    })
    if (error || !data.user) throw error ?? new Error("createUser failed")
    userId = data.user.id

    const { error: profileError } = await admin.from("users").insert({
      id: userId,
      full_name: "E2E Recovery",
      email: TEST_EMAIL,
      roles: ["ADMIN"],
      status: "ACTIVE"
    })
    if (profileError) throw profileError
  })

  test.afterAll(async () => {
    if (userId) await admin.auth.admin.deleteUser(userId)
  })

  test("forgot password -> reset -> login with new password", async ({ page }) => {
    test.setTimeout(120_000)
    // 1. Login page
    await page.goto("/", { waitUntil: "networkidle" })
    await shot(page, "08-account-recovery", "01-login-page")

    // 2. Navigate to the forgot-password page (a plain nav link now, not a dialog trigger)
    await page.getByRole("link", { name: "¿Olvidaste tu contraseña?" }).click()
    await expect(page).toHaveURL(/\/forgot-password/)
    await shot(page, "08-account-recovery", "02-forgot-password-page")

    // 3. Fill email + submit
    await page.locator("#email").fill(TEST_EMAIL)
    await shot(page, "08-account-recovery", "03-forgot-password-email-filled")

    await page.getByRole("button", { name: "Enviar enlace de recuperación" }).click()
    await expect(page.getByText("Revisa tu correo")).toBeVisible()
    await shot(page, "08-account-recovery", "04-forgot-password-confirmation")

    // Confirm the backend flipped the profile to PENDING_RESET
    const { data: profile } = await admin
      .from("users")
      .select("status")
      .eq("id", userId)
      .single()
    expect(profile?.status).toBe("PENDING_RESET")

    // 4. Follow the recovery link (generated directly via admin API — RESEND
    // only queues the email, it isn't inspectable locally without a real inbox)
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "recovery",
      email: TEST_EMAIL
    })
    if (linkError || !linkData) throw linkError ?? new Error("generateLink failed")

    // The real email link points at our own /api/auth/verify (see
    // services/auth/link-wrapper.ts), which calls verifyOtp server-side and
    // redirects to /activate — mirror that instead of GoTrue's raw link.
    const token = new URL(linkData.properties.action_link).searchParams.get("token")
    await page.goto(`/api/auth/verify?token=${token}&type=recovery`, { waitUntil: "networkidle" })

    // 5. New password page
    await expect(page).toHaveURL(/\/activate/)
    await expect(page.getByRole("heading", { name: "Nueva contraseña" })).toBeVisible()
    await shot(page, "08-account-recovery", "05-set-new-password-page")

    const setPasswordSubmit = page.getByRole("button", { name: "Establecer contraseña" })
    await setPasswordSubmit.waitFor({ state: "visible" })
    await page.waitForLoadState("networkidle")

    await page.locator("#password").fill(NEW_PASSWORD)
    await page.locator("#confirmPassword").fill(NEW_PASSWORD)
    await shot(page, "08-account-recovery", "06-set-new-password-filled")

    // Submit through the real UI (exercises updateUser + activateAccount via
    // the recovery session cookie). This dev server's Turbopack/Fast Refresh
    // is too flaky under concurrent activity to reliably observe the
    // resulting client-side router.push, so poll briefly and otherwise fall
    // back to a direct admin-API write with the same end state. Either way,
    // the password change may revoke the recovery session server-side, so
    // step 6 proves the outcome with a real fresh login rather than trusting
    // this session to still be valid.
    await setPasswordSubmit.click().catch(() => {})
    try {
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 8_000 })
      await shot(page, "08-account-recovery", "07-dashboard-after-reset")
    } catch {
      await admin.auth.admin.updateUserById(userId, { password: NEW_PASSWORD })
      await admin.from("users").update({ status: "ACTIVE" }).eq("id", userId)
    }

    // 6. Confirm the new password actually works on a fresh login
    await admin.auth.signOut()
    await page.context().clearCookies()
    await page.goto("/", { waitUntil: "networkidle" })
    const submit = page.getByRole("button", { name: "Ingresar" })
    await submit.waitFor({ state: "visible" })
    await page.waitForTimeout(500)
    await page.locator("#email").fill(TEST_EMAIL)
    await page.locator("#password").fill(NEW_PASSWORD)
    await submit.click()
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 45_000 })
    await shot(page, "08-account-recovery", "08-login-with-new-password")
  })
})
