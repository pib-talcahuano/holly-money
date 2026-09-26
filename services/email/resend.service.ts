import { Resend } from "resend"

import { AuthEmail } from "@/emails/auth-email"
import { MovementEmail } from "@/emails/movement-email"
import type { EmailSendResult, MovementIntegrationPayload } from "@/services/google/types"
import { settingsService } from "@/services/settings/settings.service"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

export const DEFAULT_FROM_EMAIL = "Sistema contable PIBT <hola@pibtalcahuano.com>"

const RESEND_TEST_RECIPIENT = "delivered@resend.dev"

// When RESEND_TEST_MODE=true, redirect every send to Resend's test address
// instead of the real recipient, so local runs don't spend real send quota
// or land in someone's actual inbox.
export function resendRecipient(to: string): string {
  return process.env.RESEND_TEST_MODE === "true" ? RESEND_TEST_RECIPIENT : to
}

const ORG_SHORT = "Sistema Contable PIBT"

const UNSUBSCRIBE_EMAIL = "hola@pibtalcahuano.com"
const TRANSACTIONAL_HEADERS = {
  "List-Unsubscribe": `<mailto:${UNSUBSCRIBE_EMAIL}?subject=unsubscribe>`,
  "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  "X-Entity-Ref-ID": "sistema-contable-pibt"
}

export async function sendMovementEmail(
  movement: MovementIntegrationPayload
): Promise<EmailSendResult> {
  // Only goes to the fixed oversight inbox now — it used to also CC whoever
  // registered the movement, which meant the treasurer got emailed on every
  // single entry they typed in themselves. If no oversight inbox is
  // configured there's nowhere to send this, so skip rather than error on an
  // empty `to`.
  if (!process.env.NOTIFICATION_EMAIL) return { ok: true, mailSent: false }

  const settings = await settingsService.getAll(createSupabaseAdminClient())
  const from = settings.notifications_from_email || DEFAULT_FROM_EMAIL

  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error } = await resend.emails.send({
    from,
    to: resendRecipient(process.env.NOTIFICATION_EMAIL),
    replyTo: process.env.NOTIFICATION_EMAIL,
    subject: `[${movement.movementTypeLabel}] ${movement.category}`,
    react: MovementEmail({ movement }),
    headers: TRANSACTIONAL_HEADERS
  })

  if (error) return { ok: false, error: error.message }
  return { ok: true, mailSent: true }
}

// ─── Auth emails ──────────────────────────────────────────────────────────────

export async function sendInviteEmail(opts: {
  to: string
  full_name: string
  action_link: string
}): Promise<void> {
  const settings = await settingsService.getAll(createSupabaseAdminClient())
  const from = settings.notifications_from_email || DEFAULT_FROM_EMAIL

  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error } = await resend.emails.send({
    from,
    to: resendRecipient(opts.to),
    subject: `Activa tu cuenta — ${ORG_SHORT}`,
    react: AuthEmail({
      title: `Hola ${opts.full_name}, tu cuenta está lista`,
      intro:
        "Un administrador ha creado una cuenta para ti en el sistema contable de la iglesia. Haz clic en el botón para activarla y establecer tu contraseña.",
      buttonLabel: "Activar mi cuenta",
      buttonUrl: opts.action_link,
      expiry: "2 días"
    }),
    headers: TRANSACTIONAL_HEADERS
  })
  if (error) throw new Error(`Resend error (invite): ${error.message}`)
}

export async function sendResetEmail(opts: {
  to: string
  full_name: string
  action_link: string
}): Promise<void> {
  const settings = await settingsService.getAll(createSupabaseAdminClient())
  const from = settings.notifications_from_email || DEFAULT_FROM_EMAIL

  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error } = await resend.emails.send({
    from,
    to: resendRecipient(opts.to),
    subject: `Restablece tu contraseña — ${ORG_SHORT}`,
    react: AuthEmail({
      title: "Restablece tu contraseña",
      intro:
        "Se ha solicitado restablecer tu contraseña. Haz clic en el botón para crear una nueva. Tu sesión está bloqueada hasta que completes este proceso.",
      buttonLabel: "Restablecer contraseña",
      buttonUrl: opts.action_link,
      expiry: "2 días"
    }),
    headers: TRANSACTIONAL_HEADERS
  })
  if (error) throw new Error(`Resend error (reset): ${error.message}`)
}

export async function sendForgotPasswordEmail(opts: {
  to: string
  action_link: string
}): Promise<void> {
  const settings = await settingsService.getAll(createSupabaseAdminClient())
  const from = settings.notifications_from_email || DEFAULT_FROM_EMAIL

  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error } = await resend.emails.send({
    from,
    to: resendRecipient(opts.to),
    subject: `Recupera tu contraseña — ${ORG_SHORT}`,
    react: AuthEmail({
      title: "Recupera tu contraseña",
      intro:
        "Recibimos una solicitud para restablecer la contraseña de tu cuenta. Si no fuiste tú, ignora este correo.",
      buttonLabel: "Restablecer contraseña",
      buttonUrl: opts.action_link,
      expiry: "2 días"
    }),
    headers: TRANSACTIONAL_HEADERS
  })
  if (error) throw new Error(`Resend error (forgot-password): ${error.message}`)
}
