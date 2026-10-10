import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database.types"
import type { CommentNotificationItem } from "@/emails/comment-notification-email"
import { sendCommentNotification } from "@/services/email/workflow-emails.service"

type DB = SupabaseClient<Database>

type Recipient = { email: string; full_name: string }

const TREASURY_KEY = "treasury"

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })

// Emails the counterpart of each new comment: the requester when someone else
// commented, the reviewer (or treasury, until someone reviews it) when the
// requester commented. Comments are batched per recipient + request so a
// conversation produces one email per run, not one per message.
export async function notifyPendingComments(db: DB, opts: { treasuryEmail?: string | null } = {}) {
  // Claim first so overlapping runs can't double-send; released again on failure.
  const { data: claimed, error } = await db
    .from("request_comments")
    .update({ notified_at: new Date().toISOString() })
    .is("notified_at", null)
    .select("id, entity_type, entity_id, user_id, message, created_at")
    .order("created_at")
  if (error) throw error
  if (!claimed?.length) return { comments: 0, emails: 0, failed: 0 }

  const settlementIds = claimed
    .filter((c) => c.entity_type === "SETTLEMENT")
    .map((c) => c.entity_id)
  const { data: settlements } = settlementIds.length
    ? await db
        .from("expense_settlements")
        .select("id, intention_id, submitted_by, reviewed_by")
        .in("id", settlementIds)
    : { data: [] }
  const settlementById = new Map((settlements ?? []).map((s) => [s.id, s]))

  const intentionIds = [
    ...new Set(
      claimed.map((c) =>
        c.entity_type === "INTENTION" ? c.entity_id : settlementById.get(c.entity_id)?.intention_id
      )
    )
  ].filter((id): id is string => !!id)
  const { data: intentions } = await db
    .from("budget_intentions")
    .select("id, amount, purpose, requested_by, reviewed_by")
    .in("id", intentionIds)
  const intentionById = new Map((intentions ?? []).map((i) => [i.id, i]))

  const userIds = [
    ...new Set([
      ...claimed.map((c) => c.user_id),
      ...(intentions ?? []).flatMap((i) => [i.requested_by, i.reviewed_by]),
      ...(settlements ?? []).flatMap((s) => [s.submitted_by, s.reviewed_by])
    ])
  ].filter((id): id is string => !!id)
  const { data: users } = await db
    .from("users")
    .select("id, email, full_name, status")
    .in("id", userIds)
  const userById = new Map((users ?? []).map((u) => [u.id, u]))

  type Group = {
    intentionId: string
    recipient: Recipient
    ids: string[]
    items: CommentNotificationItem[]
  }
  const groups = new Map<string, Group>()

  for (const c of claimed) {
    const settlement = c.entity_type === "SETTLEMENT" ? settlementById.get(c.entity_id) : undefined
    const intention = intentionById.get(settlement?.intention_id ?? c.entity_id)
    if (!intention) continue

    const requesterId = settlement?.submitted_by ?? intention.requested_by
    const reviewerId = settlement?.reviewed_by ?? intention.reviewed_by

    let key: string
    let recipient: Recipient | undefined
    if (c.user_id === requesterId) {
      if (reviewerId && reviewerId !== c.user_id) {
        key = reviewerId
        const u = userById.get(reviewerId)
        recipient = u?.status === "ACTIVE" ? u : undefined
      } else {
        key = TREASURY_KEY
        recipient = opts.treasuryEmail
          ? { email: opts.treasuryEmail, full_name: "Tesorería" }
          : undefined
      }
    } else {
      key = requesterId
      const u = userById.get(requesterId)
      recipient = u?.status === "ACTIVE" ? u : undefined
    }
    if (!recipient) continue // nobody to notify; stays marked as handled

    const groupKey = `${key}:${intention.id}`
    const group = groups.get(groupKey) ?? {
      intentionId: intention.id,
      recipient,
      ids: [],
      items: []
    }
    group.ids.push(c.id)
    group.items.push({
      author: userById.get(c.user_id)?.full_name ?? "Alguien",
      message: c.message,
      createdAt: formatDate(c.created_at)
    })
    groups.set(groupKey, group)
  }

  let emails = 0
  const failedIds: string[] = []
  for (const group of groups.values()) {
    const intention = intentionById.get(group.intentionId)!
    try {
      await sendCommentNotification(
        group.recipient.email,
        group.recipient.full_name,
        { id: intention.id, amount: Number(intention.amount), purpose: intention.purpose },
        group.items
      )
      emails++
    } catch (e) {
      console.error("[comment-notifications] send failed", e)
      failedIds.push(...group.ids)
    }
  }

  if (failedIds.length) {
    await db.from("request_comments").update({ notified_at: null }).in("id", failedIds)
  }

  return { comments: claimed.length, emails, failed: failedIds.length }
}
