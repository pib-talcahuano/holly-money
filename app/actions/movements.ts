"use server"

import { revalidatePath } from "next/cache"
import { after } from "next/server"
import { getCurrentUser, createSupabaseServerClient } from "@/lib/supabase/server"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { PERMISSIONS, can } from "@/lib/permissions/rbac"
import { movementsService } from "@/services/movements/movements.service"
import { movementAttachmentsService } from "@/services/movements/movement-attachments.service"
import { processMovementIntegrations } from "@/services/google/movement-postprocess"
import { sendVoucherEmail } from "@/services/vouchers/voucher.service"
import { settingsService } from "@/services/settings/settings.service"
import { movementSearchSchema } from "@/lib/validators/movement"
import type {
  CreateMovementInput,
  UpdateMovementInput,
  CancelMovementInput
} from "@/lib/validators/movement"

// Schedules PDF/Sheet/email integrations to run after the response is sent.
// Errors are logged so they're visible in platform logs instead of swallowed.
function scheduleIntegrations(movementId: string, userId: string) {
  after(async () => {
    try {
      await processMovementIntegrations(movementId, userId)
    } catch (error) {
      console.error("processMovementIntegrations failed", { movementId, error })
    }
  })
}

export async function createMovement(input: CreateMovementInput) {
  const user = await getCurrentUser()
  if (!user || !can(user.permissions, PERMISSIONS.CREATE_MOVEMENT)) {
    throw new Error("Sin permisos para crear movimientos")
  }

  const db = await createSupabaseServerClient()
  const created = await movementsService.create(db, input, user.id)
  if (created.notify_by_email) scheduleIntegrations(created.id, user.id)

  if (created.movement_type === "INCOME" && created.receipt_email) {
    after(async () => {
      try {
        const settings = await settingsService.getAll(createSupabaseAdminClient())
        await sendVoucherEmail(created.id, created.receipt_email!, {
          bcc: settings.notifications_bcc_email || undefined
        })
      } catch (error) {
        console.error("sendVoucherEmail (auto receipt confirmation) failed", {
          movementId: created.id,
          error
        })
      }
    })
  }

  revalidatePath("/movements")
  return created
}

export async function updateMovement(id: string, input: Omit<UpdateMovementInput, "id">) {
  const user = await getCurrentUser()
  if (!user || !can(user.permissions, PERMISSIONS.CREATE_MOVEMENT)) {
    throw new Error("Sin permisos para editar movimientos")
  }

  const db = await createSupabaseServerClient()
  const updated = await movementsService.update(db, id, { ...input, id }, user.id)
  if (updated.notify_by_email) scheduleIntegrations(updated.id, user.id)
  revalidatePath(`/movements/${id}`)
  revalidatePath("/movements")
  return updated
}

export async function cancelMovement(id: string, input: CancelMovementInput) {
  const user = await getCurrentUser()
  if (!user || !can(user.permissions, PERMISSIONS.CREATE_MOVEMENT)) {
    throw new Error("Sin permisos para anular movimientos")
  }

  const db = await createSupabaseServerClient()
  const result = await movementsService.cancel(db, id, input, user.id)
  revalidatePath(`/movements/${id}`)
  revalidatePath("/movements")
  return result
}

export async function regeneratePdf(id: string) {
  const user = await getCurrentUser()
  if (!user || !can(user.permissions, PERMISSIONS.CREATE_MOVEMENT)) {
    throw new Error("Sin permisos")
  }

  await processMovementIntegrations(id, user.id)
  revalidatePath(`/movements/${id}`)
}

export async function removeMovementAttachment(attachmentId: string): Promise<void> {
  const user = await getCurrentUser()
  if (!user || !can(user.permissions, PERMISSIONS.CREATE_MOVEMENT)) {
    throw new Error("Sin permisos para eliminar adjuntos")
  }

  const db = await createSupabaseServerClient()
  await movementAttachmentsService.remove(db, attachmentId, user.id)
}

export type MovementSearchResult = {
  id: string
  movement_date: string
  movement_type: "INCOME" | "EXPENSE"
  amount: number
  status: "ACTIVE" | "CANCELLED"
  category_name: string | null
  delivered_by: string | null
}

export async function searchMovements(query: string): Promise<MovementSearchResult[]> {
  const user = await getCurrentUser()
  if (!user || !can(user.permissions, PERMISSIONS.VIEW_MOVEMENT)) {
    throw new Error("Sin permisos para ver movimientos")
  }

  const parsed = movementSearchSchema.safeParse({ query })
  if (!parsed.success) return []

  const db = await createSupabaseServerClient()
  const { data: rows } = await movementsService.list(db, {
    search: parsed.data.query,
    status: "ALL",
    pageSize: 20
  })

  return rows.map((row) => ({
    id: row.id,
    movement_date: row.movement_date,
    movement_type: row.movement_type,
    amount: row.amount,
    status: row.status,
    category_name: row.movement_categories?.name ?? null,
    delivered_by: row.delivered_by
  }))
}
