import { randomUUID } from "node:crypto"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

const BUCKET = "attachments"

function buildPath(fileName: string): string {
  const sanitized = fileName.replace(/[^a-zA-Z0-9.\-_]+/g, "-")
  return `${randomUUID()}-${sanitized}`
}

export const attachmentStorageService = {
  async upload(input: { fileName: string; mimeType: string; buffer: Buffer }): Promise<string> {
    const path = buildPath(input.fileName)
    const admin = createSupabaseAdminClient()
    const { error } = await admin.storage.from(BUCKET).upload(path, input.buffer, {
      contentType: input.mimeType,
      upsert: false
    })
    if (error) throw error
    return path
  },

  async remove(path: string): Promise<void> {
    const admin = createSupabaseAdminClient()
    const { error } = await admin.storage.from(BUCKET).remove([path])
    if (error) throw error
  },

  async removeMany(paths: string[]): Promise<void> {
    if (paths.length === 0) return
    const admin = createSupabaseAdminClient()
    const { error } = await admin.storage.from(BUCKET).remove(paths)
    if (error) throw error
  }
}
