/**
 * @jest-environment node
 */
import { randomBytes } from "node:crypto"
import sharp from "sharp"
import { uploadAttachment } from "../attachments"

type UploadInput = { fileName: string; mimeType: string; buffer: Buffer }

const mockGetCurrentUser = jest.fn<Promise<unknown>, []>()
const mockCan = jest.fn<boolean, [Set<string> | undefined, string]>()
const mockUpload = jest.fn<Promise<string>, [UploadInput]>()
const mockRemove = jest.fn<Promise<void>, [string]>()

jest.mock("@/lib/supabase/server", () => ({
  getCurrentUser: () => mockGetCurrentUser()
}))

jest.mock("@/lib/permissions/rbac", () => ({
  PERMISSIONS: {
    CREATE_MOVEMENT: "CREATE_MOVEMENT",
    CREATE_REQUEST: "CREATE_REQUEST",
    CREATE_SETTLEMENT: "CREATE_SETTLEMENT",
    REVIEW_INTENTIONS: "REVIEW_INTENTIONS"
  },
  can: (perms: Set<string> | undefined, permission: string) => mockCan(perms, permission)
}))

jest.mock("@/services/storage/attachment-storage.service", () => ({
  attachmentStorageService: {
    upload: (input: UploadInput) => mockUpload(input),
    remove: (path: string) => mockRemove(path)
  }
}))

async function makeHeavyJpeg(): Promise<Buffer> {
  const width = 2400
  const height = 1600
  const raw = randomBytes(width * height * 3)
  return sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 100 }).toBuffer()
}

function fileFrom(bytes: Buffer, name: string, type: string): File {
  return new File([new Uint8Array(bytes)], name, { type })
}

function formDataWith(file: File): FormData {
  const fd = new FormData()
  fd.set("file", file)
  return fd
}

function lastUploadInput(): UploadInput {
  const call = mockUpload.mock.calls.at(-1)
  if (!call) throw new Error("attachmentStorageService.upload was not called")
  return call[0]
}

beforeEach(() => {
  jest.clearAllMocks()
  mockGetCurrentUser.mockResolvedValue({ id: "user-1", permissions: new Set(["CREATE_MOVEMENT"]) })
  mockCan.mockImplementation(
    (perms: Set<string> | undefined, permission: string) => perms?.has(permission) ?? false
  )
  mockUpload.mockResolvedValue("stored/path.webp")
})

describe("uploadAttachment", () => {
  it("compresses an image before storing it and returns the compressed metadata", async () => {
    const original = await makeHeavyJpeg()

    const result = await uploadAttachment(formDataWith(fileFrom(original, "receipt.jpg", "image/jpeg")))

    if ("error" in result) throw new Error(result.error)
    expect(result.mimeType).toBe("image/webp")
    expect(result.sizeBytes).toBeLessThan(original.length)

    const uploaded = lastUploadInput()
    expect(uploaded.mimeType).toBe("image/webp")
    expect(uploaded.buffer.length).toBe(result.sizeBytes)
    expect(uploaded.buffer.length).toBeLessThan(original.length)
  }, 15_000)

  it("stores non-image files without touching them", async () => {
    const bytes = Buffer.from("%PDF-1.4 pretend document")

    const result = await uploadAttachment(formDataWith(fileFrom(bytes, "comprobante.pdf", "application/pdf")))

    if ("error" in result) throw new Error(result.error)
    expect(result.mimeType).toBe("application/pdf")
    expect(result.sizeBytes).toBe(bytes.length)

    const uploaded = lastUploadInput()
    expect(uploaded.mimeType).toBe("application/pdf")
    expect(uploaded.buffer.length).toBe(bytes.length)
  })

  it("rejects a file over the size limit before compressing", async () => {
    const tooBig = fileFrom(randomBytes(11 * 1024 * 1024), "huge.jpg", "image/jpeg")

    const result = await uploadAttachment(formDataWith(tooBig))

    if (!("error" in result)) throw new Error("expected a rejection")
    expect(result.error).toContain("tamaño máximo")
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it("rejects a user without upload permission", async () => {
    mockGetCurrentUser.mockResolvedValue({ id: "user-2", permissions: new Set() })

    const result = await uploadAttachment(formDataWith(fileFrom(Buffer.from("x"), "a.pdf", "application/pdf")))

    if (!("error" in result)) throw new Error("expected a rejection")
    expect(result.error).toContain("permisos")
    expect(mockUpload).not.toHaveBeenCalled()
  })
})
