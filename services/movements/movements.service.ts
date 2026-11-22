import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database.types"
import { auditService } from "@/services/audit/audit.service"
import { sanitizePostgrestSearch } from "@/lib/utils/postgrest"
import { buildMovementSearchFilter, parseAmountTerm } from "@/lib/utils/movement-search"
import {
  accentInsensitiveRegex,
  groupNameSuggestions,
  normalizeName,
  type NameSuggestion
} from "@/lib/utils/name-suggestions"
import type { MovementTotals } from "@/types/movement-totals"
import type {
  AttachmentInput,
  CancelMovementInput,
  CreateMovementInput,
  UpdateMovementInput
} from "@/lib/validators/movement"

type DB = SupabaseClient<Database>

function normalizeOptional(value?: string | null) {
  if (!value) return null
  const trimmed = value.trim()
  return trimmed.length ? trimmed : null
}

// Best-effort: attachments are inserted after the movement row already exists.
// If this fails, the movement itself is not rolled back — the error is logged
// server-side instead of blocking the movement response.
export async function insertMovementAttachments(
  db: DB,
  movementId: string,
  attachments: AttachmentInput[],
  userId: string
) {
  const { error } = await db.from("movement_attachments").insert(
    attachments.map((attachment) => ({
      movement_id: movementId,
      storage_path: attachment.path,
      file_name: attachment.fileName,
      mime_type: attachment.mimeType,
      size_bytes: attachment.sizeBytes,
      created_by_id: userId
    }))
  )

  if (error) {
    console.error("insertMovementAttachments failed", { movementId, error })
    return
  }

  // Mirror movement-attachments.service.ts's remove(): one audit entry per file
  // for a clean, granular audit trail of every alta/baja.
  await Promise.all(
    attachments.map((attachment) =>
      auditService.logMovement({
        movement_id: movementId,
        user_id: userId,
        action: "Adjunto agregado",
        note: attachment.fileName
      })
    )
  )
}

const PAGE_SIZE = 50

type ListFilters = {
  search?: string
  movement_type?: "INCOME" | "EXPENSE" | "ALL"
  status?: "ACTIVE" | "CANCELLED" | "ALL"
  page?: number
  pageSize?: number
}

// Categories and subcategories whose name matches the (already sanitized) search term.
async function resolveSearchMatches(db: DB, term: string) {
  const [categories, subcategories] = await Promise.all([
    db.from("movement_categories").select("id").ilike("name", `%${term}%`),
    db.from("movement_subcategories").select("id").ilike("name", `%${term}%`)
  ])
  if (categories.error) throw categories.error
  if (subcategories.error) throw subcategories.error
  return {
    categoryIds: (categories.data ?? []).map((c) => c.id),
    subcategoryIds: (subcategories.data ?? []).map((c) => c.id)
  }
}

type TotalsFilters = {
  search?: string
  movement_type?: "INCOME" | "EXPENSE" | "ALL"
}

export const movementsService = {
  async totals(db: DB, filters: TotalsFilters = {}): Promise<MovementTotals> {
    const args: Database["public"]["Functions"]["get_movement_totals"]["Args"] = {}
    if (filters.movement_type && filters.movement_type !== "ALL") {
      args.p_movement_type = filters.movement_type
    }
    const term = filters.search?.trim() ? sanitizePostgrestSearch(filters.search) : ""
    if (term) {
      const { categoryIds, subcategoryIds } = await resolveSearchMatches(db, term)
      // PostgREST turns "*" into "%" in ilike values; mirror it so counts match list()
      args.p_term = term.replaceAll("*", "%")
      args.p_category_ids = categoryIds
      args.p_subcategory_ids = subcategoryIds
      const amount = parseAmountTerm(term)
      if (amount !== null) args.p_amount = amount
    }

    const { data, error } = await db.rpc("get_movement_totals", args)
    if (error) throw error

    const result: MovementTotals = {
      income: { total: 0, count: 0 },
      expense: { total: 0, count: 0 },
      net: 0
    }
    for (const row of data ?? []) {
      const bucket = row.movement_type === "INCOME" ? result.income : result.expense
      bucket.total = Number(row.total)
      bucket.count = Number(row.record_count)
    }
    result.net = result.income.total - result.expense.total
    return result
  },

  async list(db: DB, filters: ListFilters = {}) {
    const pageSize = filters.pageSize ?? PAGE_SIZE
    const page = Math.max(1, filters.page ?? 1)
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    let query = db
      .from("movements")
      .select(
        "id, movement_date, movement_type, amount, category_id, subcategory_id, delivered_by, receipt_email, payment_method_id, notes, cancellation_reason, cancelled_at, status, created_by_id, created_at, users!created_by_id(id, full_name, email), cancelled_by:users!cancelled_by_id(id, full_name, email), payment_methods:payment_method_id(name), movement_categories:category_id(name), movement_subcategories:subcategory_id(name)",
        { count: "exact" }
      )
      .order("movement_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, to)

    if (filters.movement_type && filters.movement_type !== "ALL") {
      query = query.eq("movement_type", filters.movement_type)
    }
    if (filters.status && filters.status !== "ALL") {
      query = query.eq("status", filters.status)
    }
    if (filters.search?.trim()) {
      const s = sanitizePostgrestSearch(filters.search)
      if (s) {
        const orFilter = buildMovementSearchFilter(s, await resolveSearchMatches(db, s))
        if (orFilter) query = query.or(orFilter)
      }
    }

    const { data, error, count } = await query
    if (error) throw error
    return { data: data ?? [], count: count ?? 0, page, pageSize }
  },

  async suggestDeliveredBy(
    db: DB,
    input: { query: string; movementType: "INCOME" | "EXPENSE" }
  ): Promise<NameSuggestion[]> {
    const term = sanitizePostgrestSearch(input.query)
    if (!term) return []

    const { data, error } = await db
      .from("movements")
      .select("delivered_by")
      .eq("status", "ACTIVE")
      .eq("movement_type", input.movementType)
      .not("delivered_by", "is", null)
      .filter("delivered_by", "imatch", accentInsensitiveRegex(term))
      .order("movement_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200)
    if (error) throw error

    const needle = normalizeName(term)
    const names = (data ?? [])
      .map((row) => row.delivered_by)
      .filter((name): name is string => !!name && normalizeName(name).includes(needle))
    return groupNameSuggestions(names, 8)
  },

  async findById(db: DB, id: string) {
    const { data, error } = await db
      .from("movements")
      .select(
        `*,
        created_by:users!created_by_id(id, full_name, email),
        updated_by:users!updated_by_id(id, full_name, email),
        cancelled_by:users!cancelled_by_id(id, full_name, email),
        movement_audit_log(*, users!movement_audit_log_user_id_fkey(id, full_name, email), impersonator:users!movement_audit_log_impersonator_id_fkey(id, full_name, email)),
        movement_attachments(*),
        payment_methods:payment_method_id(name),
        movement_categories:category_id(name),
        movement_subcategories:subcategory_id(name)`
      )
      .eq("id", id)
      .order("event_date", { referencedTable: "movement_audit_log", ascending: false })
      .order("created_at", { referencedTable: "movement_attachments", ascending: true })
      .single()

    if (error) throw error
    return data
  },

  async create(db: DB, input: CreateMovementInput, userId: string) {
    const { data: movement, error } = await db
      .from("movements")
      .insert({
        movement_date: input.movement_date,
        movement_type: input.movement_type,
        amount: input.amount,
        category_id: input.category_id,
        subcategory_id: input.subcategory_id ?? null,
        delivered_by: normalizeOptional(input.delivered_by),
        receipt_email: normalizeOptional(input.receipt_email),
        payment_method_id: input.payment_method_id ?? null,
        notes: normalizeOptional(input.notes),
        notify_by_email: input.notify_by_email,
        notification_status: input.notify_by_email ? "PENDING" : "SKIPPED",
        created_by_id: userId
      })
      .select()
      .single()

    if (error) throw error

    await auditService.logMovement({
      movement_id: movement.id,
      user_id: userId,
      action: "Movimiento creado",
      new_value: movement,
      note: "Movimiento registrado exitosamente"
    })

    if (input.attachments.length) {
      await insertMovementAttachments(db, movement.id, input.attachments, userId)
    }

    return movement
  },

  async update(db: DB, id: string, input: UpdateMovementInput, userId: string) {
    const { data: previous, error: fetchError } = await db
      .from("movements")
      .select()
      .eq("id", id)
      .single()

    if (fetchError) throw fetchError
    if (!previous) throw new Error("Movimiento no encontrado")
    if (previous.status === "CANCELLED") throw new Error("No se puede editar un movimiento anulado")

    const { data: updated, error } = await db
      .from("movements")
      .update({
        movement_date: input.movement_date,
        movement_type: input.movement_type,
        amount: input.amount,
        category_id: input.category_id,
        subcategory_id: input.subcategory_id ?? null,
        delivered_by: normalizeOptional(input.delivered_by),
        receipt_email: normalizeOptional(input.receipt_email),
        payment_method_id: input.payment_method_id ?? null,
        notes: normalizeOptional(input.notes),
        notify_by_email: input.notify_by_email,
        notification_status: input.notify_by_email ? "PENDING" : "SKIPPED",
        updated_by_id: userId,
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    await auditService.logMovement({
      movement_id: id,
      user_id: userId,
      action: "Movimiento editado",
      previous_value: previous,
      new_value: updated,
      note: "Información del movimiento actualizada"
    })

    // Only NEW attachments are appended here — existing ones aren't resent.
    if (input.attachments.length) {
      await insertMovementAttachments(db, id, input.attachments, userId)
    }

    return updated
  },

  async cancel(db: DB, id: string, input: CancelMovementInput, userId: string) {
    const { data: previous, error: fetchError } = await db
      .from("movements")
      .select()
      .eq("id", id)
      .single()

    if (fetchError) throw fetchError
    if (!previous) throw new Error("Movimiento no encontrado")
    if (previous.status === "CANCELLED") return previous

    const now = new Date().toISOString()
    const { data: cancelled, error } = await db
      .from("movements")
      .update({
        status: "CANCELLED",
        cancellation_reason: input.cancellation_reason.trim(),
        cancelled_by_id: userId,
        cancelled_at: now,
        updated_by_id: userId,
        updated_at: now
      })
      .eq("id", id)
      .select()
      .single()

    if (error) throw error

    await auditService.logMovement({
      movement_id: id,
      user_id: userId,
      action: "Movimiento anulado",
      previous_value: previous,
      new_value: cancelled,
      note: input.cancellation_reason.trim()
    })

    return cancelled
  }
}
