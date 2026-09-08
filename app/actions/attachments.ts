"use server"

import { getCurrentUser } from "@/lib/supabase/server"
import { PERMISSIONS, can } from "@/lib/permissions/rbac"
import { attachmentStorageService } from "@/services/storage/attachment-storage.service"
import { compressImage } from "@/services/storage/image-compression.service"
import { MAX_ATTACHMENT_SIZE_BYTES } from "@/lib/constants/attachments"

// This action just uploads a file to Supabase Storage and hands back its
// path — it doesn't touch any entity-specific table, so it's shared by every
// entity that attaches files (movements, transfer registration, ministry
// settlements, payroll liquidaciones). Anyone who can create a movement,
// submit a request, review one, or register payroll can use it.
function canUploadAttachment(permissions: Set<string> | undefined): boolean {
  return (
    can(permissions, PERMISSIONS.CREATE_MOVEMENT) ||
    can(permissions, PERMISSIONS.CREATE_REQUEST) ||
    can(permissions, PERMISSIONS.CREATE_SETTLEMENT) ||
    can(permissions, PERMISSIONS.REVIEW_INTENTIONS)
  )
}

export async function uploadAttachment(
  formData: FormData
): Promise<
  | {
      path: string
      fileName: string
      mimeType: string
      sizeBytes: number
    }
  | { error: string }
> {
  const user = await getCurrentUser()
  if (!user || !canUploadAttachment(user.permissions)) {
    return { error: "Sin permisos para adjuntar archivos" }
  }

  const file = formData.get("file")
  if (!(file instanceof File)) {
    return { error: "Archivo no válido" }
  }

  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    return { error: "El archivo supera el tamaño máximo permitido (10MB)" }
  }

  const originalBuffer = Buffer.from(await file.arrayBuffer())

  // The client compresses images too (hooks/use-attachment-upload.ts), but a
  // client that skips or fails that step must not be able to park a full-size
  // photo in permanent storage — movements are never deleted.
  const { buffer, mimeType, sizeBytes } = await compressImage({
    buffer: originalBuffer,
    mimeType: file.type
  })

  try {
    const path = await attachmentStorageService.upload({
      fileName: file.name,
      mimeType,
      buffer
    })

    return {
      path,
      fileName: file.name,
      mimeType,
      sizeBytes
    }
  } catch (error) {
    console.error("attachmentStorageService.upload failed", error)
    return { error: "No se pudo subir el archivo" }
  }
}

// Cleans up a storage object for an attachment that was uploaded but never
// persisted to an entity (e.g. the user clicked "remove" before submitting
// the form). There is no DB row to touch here — persisted attachments must
// go through their entity's own remove() (e.g. movementAttachmentsService.remove),
// which handles the DB row + storage deletion together.
export async function deleteUnattachedAttachment(path: string): Promise<void> {
  const user = await getCurrentUser()
  if (!user || !canUploadAttachment(user.permissions)) {
    throw new Error("Sin permisos para eliminar adjuntos")
  }

  try {
    await attachmentStorageService.remove(path)
  } catch (error) {
    console.error("deleteUnattachedAttachment failed", { path, error })
  }
}
