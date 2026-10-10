import { Resend } from "resend"

import {
  CommentNotificationEmail,
  type CommentNotificationItem
} from "@/emails/comment-notification-email"
import { IntentionNotificationEmail } from "@/emails/intention-notification-email"
import { IntentionReviewEmail } from "@/emails/intention-review-email"
import { ReminderEmail } from "@/emails/reminder-email"
import { SettlementReviewEmail } from "@/emails/settlement-review-email"
import { SettlementReturnedEmail } from "@/emails/settlement-returned-email"
import { TransferNotificationEmail } from "@/emails/transfer-notification-email"
import { DEFAULT_FROM_EMAIL, resendRecipient } from "@/services/email/resend.service"
import { settingsService } from "@/services/settings/settings.service"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { getSiteUrl } from "@/lib/utils"

const ORG_SHORT = "Sistema Contable PIBT"
const UNSUBSCRIBE_EMAIL = "hola@pibtalcahuano.com"
const BASE_URL = getSiteUrl()

const TRANSACTIONAL_HEADERS = {
  "List-Unsubscribe": `<mailto:${UNSUBSCRIBE_EMAIL}?subject=unsubscribe>`,
  "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  "X-Entity-Ref-ID": "sistema-contable-pibt"
}

export async function sendIntentionNotification(intention: {
  id: string
  amount: number
  purpose: string
  token: string
}): Promise<void> {
  const settings = await settingsService.getAll(createSupabaseAdminClient())
  const to = settings.tesoreria_notification_email
  if (!to) return
  const from = settings.notifications_from_email || DEFAULT_FROM_EMAIL

  const resend = new Resend(process.env.RESEND_API_KEY)
  await resend.emails.send({
    from,
    to: resendRecipient(to),
    subject: `Nueva solicitud de presupuesto — ${ORG_SHORT}`,
    react: IntentionNotificationEmail({
      intention,
      reviewUrl: `${BASE_URL}/requests/${intention.id}`
    }),
    headers: TRANSACTIONAL_HEADERS
  })
}

export async function sendIntentionReviewNotification(
  intention: { id: string; amount: number; purpose: string },
  minister: { email: string; full_name: string },
  action: "APPROVED" | "REJECTED"
): Promise<void> {
  const settings = await settingsService.getAll(createSupabaseAdminClient())
  const to = settings.voucher_email || minister.email
  const from = settings.notifications_from_email || DEFAULT_FROM_EMAIL
  const resend = new Resend(process.env.RESEND_API_KEY)

  const statusLabel = action === "APPROVED" ? "aprobada" : "rechazada"

  await resend.emails.send({
    from,
    to: resendRecipient(to),
    subject: `Solicitud ${statusLabel} — ${ORG_SHORT}`,
    react: IntentionReviewEmail({
      intention,
      minister,
      action,
      detailUrl: `${BASE_URL}/requests/${intention.id}`
    }),
    headers: TRANSACTIONAL_HEADERS
  })
}

export async function sendTransferNotification(
  intention: { id: string; amount: number; purpose: string },
  minister: { email: string; full_name: string }
): Promise<void> {
  const settings = await settingsService.getAll(createSupabaseAdminClient())
  const to = settings.voucher_email || minister.email
  const from = settings.notifications_from_email || DEFAULT_FROM_EMAIL
  const resend = new Resend(process.env.RESEND_API_KEY)

  await resend.emails.send({
    from,
    to: resendRecipient(to),
    subject: `Transferencia registrada — ${ORG_SHORT}`,
    react: TransferNotificationEmail({
      intention,
      minister,
      detailUrl: `${BASE_URL}/requests/${intention.id}`
    }),
    headers: TRANSACTIONAL_HEADERS
  })
}

export async function sendSettlementReviewNotification(
  settlement: { intention_id: string; amount: number; description: string },
  minister: { email: string; full_name: string },
  action: "APPROVED" | "REJECTED"
): Promise<void> {
  const settings = await settingsService.getAll(createSupabaseAdminClient())
  const to = settings.voucher_email || minister.email
  const from = settings.notifications_from_email || DEFAULT_FROM_EMAIL
  const resend = new Resend(process.env.RESEND_API_KEY)

  const statusLabel = action === "APPROVED" ? "aprobada" : "rechazada"

  await resend.emails.send({
    from,
    to: resendRecipient(to),
    subject: `Rendición ${statusLabel} — ${ORG_SHORT}`,
    react: SettlementReviewEmail({
      settlement,
      minister,
      action,
      detailUrl: `${BASE_URL}/requests/${settlement.intention_id}`
    }),
    headers: TRANSACTIONAL_HEADERS
  })
}

export async function sendSettlementReturnedNotification(
  settlement: { intention_id: string; amount: number; description: string },
  minister: { email: string; full_name: string },
  message: string
): Promise<void> {
  const settings = await settingsService.getAll(createSupabaseAdminClient())
  const to = settings.voucher_email || minister.email
  const from = settings.notifications_from_email || DEFAULT_FROM_EMAIL
  const resend = new Resend(process.env.RESEND_API_KEY)

  await resend.emails.send({
    from,
    to: resendRecipient(to),
    subject: `Rendición devuelta para corrección — ${ORG_SHORT}`,
    react: SettlementReturnedEmail({
      settlement,
      minister,
      message,
      detailUrl: `${BASE_URL}/requests/${settlement.intention_id}`
    }),
    headers: TRANSACTIONAL_HEADERS
  })
}

export async function sendCommentNotification(
  to: string,
  recipientName: string,
  intention: { id: string; amount: number; purpose: string },
  comments: CommentNotificationItem[]
): Promise<void> {
  const settings = await settingsService.getAll(createSupabaseAdminClient())
  const from = settings.notifications_from_email || DEFAULT_FROM_EMAIL
  const resend = new Resend(process.env.RESEND_API_KEY)

  const { error } = await resend.emails.send({
    from,
    to: resendRecipient(to),
    subject: `${comments.length === 1 ? "Nuevo comentario" : "Nuevos comentarios"} en una solicitud — ${ORG_SHORT}`,
    react: CommentNotificationEmail({
      recipientName,
      intention,
      comments,
      detailUrl: `${BASE_URL}/requests/${intention.id}`
    }),
    headers: TRANSACTIONAL_HEADERS
  })
  if (error) throw new Error(error.message)
}

export async function sendReminderEmail(summary: {
  intentions: number
  settlements: number
  missing_transfers: number
}): Promise<void> {
  const settings = await settingsService.getAll(createSupabaseAdminClient())
  const to = settings.tesoreria_notification_email
  if (!to) return
  const from = settings.notifications_from_email || DEFAULT_FROM_EMAIL

  const resend = new Resend(process.env.RESEND_API_KEY)
  const total = summary.intentions + summary.settlements + summary.missing_transfers

  await resend.emails.send({
    from,
    to: resendRecipient(to),
    subject: `[Recordatorio] ${total} items pendientes — ${ORG_SHORT}`,
    react: ReminderEmail({ summary, dashboardUrl: `${BASE_URL}/requests` }),
    headers: TRANSACTIONAL_HEADERS
  })
}
