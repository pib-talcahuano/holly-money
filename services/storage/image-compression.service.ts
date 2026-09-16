import sharp from "sharp"

// Receipts/comprobantes don't need more than this to stay legible, and this
// app's movements are never deleted — every uploaded photo stays in Supabase
// Storage forever, so keeping images small matters for the free-tier 1GB quota.
// The client compresses too (hooks/use-attachment-upload.ts); this is the
// server-side guarantee for clients that skip or fail that step.
const MAX_DIMENSION = 1600
const WEBP_QUALITY = 72

// Formats sharp can reliably decode from a plain buffer in this deployment.
// Anything else (PDF, GIF, HEIC, SVG) passes through untouched.
const COMPRESSIBLE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])

type CompressImageInput = {
  buffer: Buffer
  mimeType: string
}

type CompressImageResult = {
  buffer: Buffer
  mimeType: string
  sizeBytes: number
}

function passthrough(input: CompressImageInput): CompressImageResult {
  return { buffer: input.buffer, mimeType: input.mimeType, sizeBytes: input.buffer.length }
}

export async function compressImage(input: CompressImageInput): Promise<CompressImageResult> {
  if (!COMPRESSIBLE_MIME_TYPES.has(input.mimeType)) return passthrough(input)

  try {
    const buffer = await sharp(input.buffer)
      .rotate() // honour EXIF orientation before we drop the metadata
      .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer()

    return { buffer, mimeType: "image/webp", sizeBytes: buffer.length }
  } catch (error) {
    console.warn("compressImage failed, keeping original file", {
      mimeType: input.mimeType,
      error
    })
    return passthrough(input)
  }
}
