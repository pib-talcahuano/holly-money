/**
 * @jest-environment node
 */
import { randomBytes } from "node:crypto"
import sharp from "sharp"
import { compressImage } from "@/services/storage/image-compression.service"

// A realistically heavy image: random noise doesn't compress well, so a
// 2400x1600 JPEG at max quality lands in the multi-MB range — the same shape
// as a phone photo of a receipt.
async function makeHeavyJpeg(): Promise<Buffer> {
  const width = 2400
  const height = 1600
  const raw = randomBytes(width * height * 3)
  return sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 100 }).toBuffer()
}

describe("compressImage", () => {
  it("shrinks a large JPEG and re-encodes it as WebP", async () => {
    const original = await makeHeavyJpeg()

    const result = await compressImage({ buffer: original, mimeType: "image/jpeg" })

    expect(result.mimeType).toBe("image/webp")
    expect(result.buffer.length).toBeLessThan(original.length)
    expect(result.sizeBytes).toBe(result.buffer.length)
  }, 15_000)

  it("caps the longest edge at 1600px", async () => {
    const original = await makeHeavyJpeg()

    const result = await compressImage({ buffer: original, mimeType: "image/jpeg" })

    const meta = await sharp(result.buffer).metadata()
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(1600)
  }, 15_000)

  it("does not upscale an image already smaller than the cap", async () => {
    const small = await sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 10, g: 20, b: 30 } }
    })
      .png()
      .toBuffer()

    const result = await compressImage({ buffer: small, mimeType: "image/png" })

    const meta = await sharp(result.buffer).metadata()
    expect(meta.width).toBe(800)
    expect(meta.height).toBe(600)
  })

  it("passes non-image content through untouched", async () => {
    const pdf = Buffer.from("%PDF-1.4 not really a pdf")

    const result = await compressImage({ buffer: pdf, mimeType: "application/pdf" })

    expect(result.buffer).toBe(pdf)
    expect(result.mimeType).toBe("application/pdf")
    expect(result.sizeBytes).toBe(pdf.length)
  })

  it("passes unsupported image types (e.g. GIF) through untouched", async () => {
    const gif = Buffer.from("GIF89a fake")

    const result = await compressImage({ buffer: gif, mimeType: "image/gif" })

    expect(result.buffer).toBe(gif)
    expect(result.mimeType).toBe("image/gif")
  })

  it("returns the original buffer when the image cannot be decoded", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {})
    const corrupt = Buffer.from("not a real jpeg body")

    const result = await compressImage({ buffer: corrupt, mimeType: "image/jpeg" })

    expect(result.buffer).toBe(corrupt)
    expect(result.mimeType).toBe("image/jpeg")
    expect(result.sizeBytes).toBe(corrupt.length)
    warn.mockRestore()
  })
})
