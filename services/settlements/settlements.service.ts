import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database.types"
import { auditService } from "@/services/audit/audit.service"
import {
  sendSettlementReviewNotification,
  sendSettlementReturnedNotification
} from "@/services/email/workflow-emails.service"
import type {
  CreateSettlementInput,
  ReviewSettlementInput,
  CloseIntentionInput
} from "@/lib/validators/settlement"

type DB = SupabaseClient<Database>

const LATE_THRESHOLD_DAYS = 30
const CANCELLABLE_STATUSES = ["DRAFT", "PENDING", "RETURNED_FOR_CORRECTION"] as const
const RESUBMITTABLE_STATUSES = ["DRAFT", "RETURNED_FOR_CORRECTION"] as const

async function insertSettlementAttachments(
  db: DB,
  settlementId: string,
  attachments: CreateSettlementInput["attachments"],
  userId: string
) {
  if (!attachments.length) return
  const { error } = await db.from("settlement_attachments").insert(
    attachments.map((attachment) => ({
      settlement_id: settlementId,
      storage_path: attachment.path,
      file_name: attachment.fileName,
      mime_type: attachment.mimeType,
      size_bytes: attachment.sizeBytes,
      created_by_id: userId
    }))
  )
  if (error) throw error
}

async function insertIntentionAttachments(
  db: DB,
  intentionId: string,
  attachments: CloseIntentionInput["attachments"],
  userId: string
) {
  const { error } = await db.from("intention_attachments").insert(
    attachments.map((attachment) => ({
      intention_id: intentionId,
      storage_path: attachment.path,
      file_name: attachment.fileName,
      mime_type: attachment.mimeType,
      size_bytes: attachment.sizeBytes,
      created_by_id: userId
    }))
  )
  if (error) throw error
}

export const settlementsService = {
  async list(
    db: DB,
    filters?: {
      intentionId?: string
      ministryId?: string
      status?: string
      submittedBy?: string
    }
  ) {
    let query = db
      .from("expense_settlements")
      .select(
        "*, settlement_attachments(*), budget_intentions(id, ministry_id, ministries(id, name)), users!expense_settlements_submitted_by_fkey(id, full_name, email), reviewer:users!expense_settlements_reviewed_by_fkey(id, full_name, email)"
      )
      .order("created_at", { ascending: false })

    if (filters?.intentionId) query = query.eq("intention_id", filters.intentionId)
    if (filters?.submittedBy) query = query.eq("submitted_by", filters.submittedBy)
    if (filters?.status)
      query = query.eq(
        "status",
        filters.status as
          | "DRAFT"
          | "PENDING"
          | "IN_REVIEW"
          | "APPROVED"
          | "REJECTED"
          | "RETURNED_FOR_CORRECTION"
          | "CANCELLED"
      )

    const { data, error } = await query
    if (error) throw error
    return data
  },

  async getById(db: DB, id: string) {
    const { data, error } = await db
      .from("expense_settlements")
      .select(
        "*, settlement_attachments(*), budget_intentions(id, ministry_id, amount, funding_method, ministries(id, name)), users!expense_settlements_submitted_by_fkey(id, full_name, email), reviewer:users!expense_settlements_reviewed_by_fkey(id, full_name, email)"
      )
      .eq("id", id)
      .single()
    if (error) throw error
    return data
  },

  async create(db: DB, input: CreateSettlementInput, userId: string) {
    const expenseDate = new Date(input.expense_date)
    const daysDiff = Math.floor((Date.now() - expenseDate.getTime()) / 86_400_000)
    const isLate = daysDiff > LATE_THRESHOLD_DAYS

    const { data, error } = await db
      .from("expense_settlements")
      .insert({
        intention_id: input.intention_id,
        submitted_by: userId,
        amount: input.amount,
        description: input.description,
        expense_date: input.expense_date,
        is_late: isLate,
        status: input.isDraft ? "DRAFT" : "PENDING"
      })
      .select()
      .single()
    if (error) throw error

    if (input.attachments.length) {
      await insertSettlementAttachments(db, data.id, input.attachments, userId)
    }

    await auditService.logSystem({
      entity: "EXPENSE_SETTLEMENT",
      action: "SETTLEMENT_CREATED",
      user_id: userId,
      entity_id: data.id,
      new_value: {
        amount: data.amount,
        intention_id: input.intention_id,
        is_late: isLate,
        status: data.status
      }
    })

    return data
  },

  // DRAFT or RETURNED_FOR_CORRECTION -> PENDING. Only the minister who owns the
  // settlement can submit it; RLS already scopes the UPDATE to submitted_by =
  // auth.uid(), this just gives a friendly error instead of a silent no-op.
  async submit(db: DB, id: string, userId: string) {
    const { data: current, error: fetchError } = await db
      .from("expense_settlements")
      .select("status, submitted_by")
      .eq("id", id)
      .single()
    if (fetchError) throw fetchError

    if (current.submitted_by !== userId) {
      throw new Error("Solo quien envió la rendición puede enviarla a revisión")
    }
    if (!RESUBMITTABLE_STATUSES.includes(current.status as (typeof RESUBMITTABLE_STATUSES)[number])) {
      return { alreadyActioned: true }
    }

    const now = new Date().toISOString()
    const { data, error } = await db
      .from("expense_settlements")
      .update({ status: "PENDING", updated_at: now })
      .eq("id", id)
      .select()
      .single()
    if (error) throw error

    await auditService.logSystem({
      entity: "EXPENSE_SETTLEMENT",
      action: "SETTLEMENT_SUBMITTED",
      user_id: userId,
      entity_id: id,
      previous_value: { status: current.status },
      new_value: { status: "PENDING" }
    })

    return { alreadyActioned: false, data }
  },

  // PENDING -> IN_REVIEW. Tesorería takes a settlement into review, locking it
  // against edits/cancellation from the minister's side.
  async startReview(db: DB, id: string, reviewerId: string) {
    const { data: current, error: fetchError } = await db
      .from("expense_settlements")
      .select("status")
      .eq("id", id)
      .single()
    if (fetchError) throw fetchError

    if (current.status !== "PENDING") {
      return { alreadyActioned: true }
    }

    const now = new Date().toISOString()
    const { data, error } = await db
      .from("expense_settlements")
      .update({ status: "IN_REVIEW", updated_at: now })
      .eq("id", id)
      .select()
      .single()
    if (error) throw error

    await auditService.logSystem({
      entity: "EXPENSE_SETTLEMENT",
      action: "SETTLEMENT_IN_REVIEW",
      user_id: reviewerId,
      entity_id: id,
      previous_value: { status: "PENDING" },
      new_value: { status: "IN_REVIEW" }
    })

    return { alreadyActioned: false, data }
  },

  // Only reachable from DRAFT, PENDING or RETURNED_FOR_CORRECTION — once
  // IN_REVIEW, the settlement is locked until tesorería decides.
  async cancel(db: DB, id: string, userId: string) {
    const { data: current, error: fetchError } = await db
      .from("expense_settlements")
      .select("status, submitted_by")
      .eq("id", id)
      .single()
    if (fetchError) throw fetchError

    if (current.submitted_by !== userId) {
      throw new Error("Solo quien envió la rendición puede cancelarla")
    }
    if (!CANCELLABLE_STATUSES.includes(current.status as (typeof CANCELLABLE_STATUSES)[number])) {
      throw new Error(
        "Esta rendición ya está en revisión o tiene una decisión final; no se puede cancelar"
      )
    }

    const now = new Date().toISOString()
    const { data, error } = await db
      .from("expense_settlements")
      .update({ status: "CANCELLED", updated_at: now })
      .eq("id", id)
      .select()
      .single()
    if (error) throw error

    await auditService.logSystem({
      entity: "EXPENSE_SETTLEMENT",
      action: "SETTLEMENT_CANCELLED",
      user_id: userId,
      entity_id: id,
      previous_value: { status: current.status },
      new_value: { status: "CANCELLED" }
    })

    return data
  },

  async review(db: DB, id: string, input: ReviewSettlementInput, reviewerId: string) {
    const now = new Date().toISOString()

    const { data: current } = await db
      .from("expense_settlements")
      .select(
        "status, intention_id, amount, description, users!expense_settlements_submitted_by_fkey(email, full_name)"
      )
      .eq("id", id)
      .single()

    if (current?.status !== "IN_REVIEW") {
      return { alreadyActioned: true }
    }

    const ministerUser = current?.users

    if (input.action === "RETURNED_FOR_CORRECTION") {
      await db.from("request_comments").insert({
        entity_type: "SETTLEMENT",
        entity_id: id,
        user_id: reviewerId,
        message: input.message,
        // already emailed via sendSettlementReturnedNotification
        notified_at: now
      })

      const { data, error } = await db
        .from("expense_settlements")
        .update({
          status: "RETURNED_FOR_CORRECTION",
          reviewed_by: reviewerId,
          reviewed_at: now,
          review_message: input.message,
          updated_at: now
        })
        .eq("id", id)
        .select()
        .single()
      if (error) throw error

      await auditService.logSystem({
        entity: "EXPENSE_SETTLEMENT",
        action: "SETTLEMENT_RETURNED_FOR_CORRECTION",
        user_id: reviewerId,
        entity_id: id,
        previous_value: { status: "IN_REVIEW" },
        new_value: { status: "RETURNED_FOR_CORRECTION", message: input.message }
      })

      if (ministerUser?.email) {
        await sendSettlementReturnedNotification(
          { intention_id: current.intention_id, amount: current.amount, description: current.description },
          ministerUser,
          input.message
        ).catch(() => null)
      }

      return { alreadyActioned: false, data }
    }

    let movementId: string | null = null

    if (input.action === "APPROVED") {
      const settlement = await this.getById(db, id)
      const intention = settlement.budget_intentions
      const ministry = intention?.ministries

      if (intention?.funding_method === "TRANSFER") {
        // TRANSFER-funded intentions already moved the money out of the account when
        // the transfer was registered (Task 2's registerTransfer). Approving the
        // settlement here must reuse that movement instead of creating a second one,
        // otherwise the outflow would be recorded twice.
        const { data: transfer, error: transferErr } = await db
          .from("intention_transfers")
          .select("movement_id")
          .eq("intention_id", intention.id)
          .maybeSingle()
        if (transferErr) throw transferErr
        if (!transfer?.movement_id) {
          throw new Error(
            "Esta solicitud usa transferencia anticipada pero no tiene un movimiento de transferencia registrado; no se puede aprobar la rendición"
          )
        }
        movementId = transfer.movement_id
      } else {
        // Movement INSERT requires service_role: movements_insert RLS only allows ADMIN/BURSAR,
        // but FINANCE reviewers must also be able to approve. Admin client is used here explicitly.
        const { createSupabaseAdminClient: getAdmin } = await import("@/lib/supabase/admin")

        const adminClient = getAdmin()

        // movements.category_id is a required FK now (Etapa 2 replaced the free-text
        // category column). Look up the system category seeded for this workflow by
        // its exact seeded name rather than hardcoding an id.
        const { data: settlementCategory, error: categoryErr } = await adminClient
          .from("movement_categories")
          .select("id")
          .eq("name", "Rendiciones de Ministerio")
          .eq("is_system", true)
          .single()
        if (categoryErr || !settlementCategory) {
          throw new Error("No se encontró la categoría del sistema 'Rendiciones de Ministerio'")
        }

        const { data: movement, error: movErr } = await adminClient
          .from("movements")
          .insert({
            movement_date: now.slice(0, 10),
            movement_type: "EXPENSE",
            amount: settlement.amount,
            category_id: settlementCategory.id,
            delivered_by: ministry?.name ?? "Ministerio",
            created_by_id: reviewerId,
            notes: `Rendición: ${settlement.description}. Rendición automática desde solicitud aprobada. Ministerio: ${ministry?.name ?? ""}`
          })
          .select("id")
          .single()
        if (movErr) throw movErr
        movementId = movement.id

        await auditService.logMovement({
          movement_id: movementId,
          action: "MOVEMENT_CREATED_FROM_SETTLEMENT",
          user_id: reviewerId,
          new_value: { settlement_id: id, amount: settlement.amount }
        })
      }
    }

    const { data, error } = await db
      .from("expense_settlements")
      .update({
        status: input.action,
        reviewed_by: reviewerId,
        reviewed_at: now,
        review_message: input.message,
        movement_id: movementId,
        updated_at: now
      })
      .eq("id", id)
      .select()
      .single()
    if (error) throw error

    await auditService.logSystem({
      entity: "EXPENSE_SETTLEMENT",
      action: `SETTLEMENT_${input.action}`,
      user_id: reviewerId,
      entity_id: id,
      previous_value: { status: "IN_REVIEW" },
      new_value: { status: input.action, message: input.message, movement_id: movementId }
    })

    if (ministerUser?.email) {
      await sendSettlementReviewNotification(
        { intention_id: current.intention_id, amount: current.amount, description: current.description },
        ministerUser,
        input.action
      ).catch(() => null)
    }

    return { alreadyActioned: false, data }
  },

  // Tesorería attaches the closing transfer's proof and marks the whole request
  // as settled — one closing transfer can cover several settlements, so this is
  // scoped to the intention rather than any single settlement.
  async closeIntention(db: DB, input: CloseIntentionInput, userId: string) {
    await insertIntentionAttachments(db, input.intention_id, input.attachments, userId)

    const now = new Date().toISOString()
    const { data, error } = await db
      .from("budget_intentions")
      .update({ settlement_closed_at: now, updated_at: now })
      .eq("id", input.intention_id)
      .select()
      .single()
    if (error) throw error

    await auditService.logSystem({
      entity: "BUDGET_INTENTION",
      action: "INTENTION_SETTLEMENT_CLOSED",
      user_id: userId,
      entity_id: input.intention_id,
      new_value: { settlement_closed_at: now }
    })

    return data
  },

  // Bulk fetch for the settlements list on the request detail page — one query
  // for all settlements' correction-comment threads instead of one per row.
  async getCommentsBySettlementIds(db: DB, settlementIds: string[]) {
    if (!settlementIds.length) return []
    const { data, error } = await db
      .from("request_comments")
      .select("*, users(id, full_name, roles)")
      .eq("entity_type", "SETTLEMENT")
      .in("entity_id", settlementIds)
      .order("created_at", { ascending: true })
    if (error) throw error
    return data
  },

  async getPendingCount(db: DB, ministryId?: string) {
    let query = db
      .from("expense_settlements")
      .select("id", { count: "exact", head: true })
      .eq("status", "PENDING")

    if (ministryId) {
      const { data: intentions } = await db
        .from("budget_intentions")
        .select("id")
        .eq("ministry_id", ministryId)
      if (intentions && intentions.length > 0) {
        query = query.in(
          "intention_id",
          intentions.map((i) => i.id)
        )
      }
    }

    const { count, error } = await query
    if (error) throw error
    return count ?? 0
  }
}
