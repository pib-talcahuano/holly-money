import {
  inviteUser,
  updateUser,
  deleteUser,
  getUserPurgePreview,
  resendInvite,
  resetUser
} from "../users"

const mockGetCurrentUser = jest.fn()
const mockCan = jest.fn()
const mockInvite = jest.fn()
const mockUpdate = jest.fn()
const mockDelete = jest.fn()
const mockPreviewPurge = jest.fn()
const mockResendInvite = jest.fn()
const mockResetAccount = jest.fn()
const mockRevalidatePath = jest.fn()

jest.mock("@/lib/supabase/server", () => ({
  getCurrentUser: () => mockGetCurrentUser()
}))

jest.mock("@/lib/permissions/rbac", () => ({
  PERMISSIONS: { MANAGE_USERS: "MANAGE_USERS" },
  can: (...args: unknown[]) => mockCan(...args),
  isImpersonating: (user: { impersonatorId?: string | null } | null | undefined) =>
    !!user?.impersonatorId
}))

jest.mock("@/services/users/users.service", () => ({
  usersService: {
    invite: (...args: unknown[]) => mockInvite(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
    previewPurge: (...args: unknown[]) => mockPreviewPurge(...args),
    resendInvite: (...args: unknown[]) => mockResendInvite(...args),
    resetAccount: (...args: unknown[]) => mockResetAccount(...args)
  }
}))

jest.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args)
}))

const mockUser = { id: "admin-1", permissions: ["MANAGE_USERS"] }
const createInput = { email: "new@example.com", full_name: "New User", role: "MINISTER" as const }
const updateInput = {
  id: "u-1",
  full_name: "Updated",
  role: "MINISTER" as const,
  status: "ACTIVE" as const
}

describe("users actions — auth guard", () => {
  beforeEach(() => jest.clearAllMocks())

  it.each([
    ["inviteUser", () => inviteUser(createInput)],
    ["updateUser", () => updateUser(updateInput)],
    ["resendInvite", () => resendInvite("u-1")],
    ["resetUser", () => resetUser("u-1")]
  ])("%s throws when unauthenticated", async (_name, fn) => {
    mockGetCurrentUser.mockResolvedValue(null)
    mockCan.mockReturnValue(false)
    await expect(fn()).rejects.toThrow("Sin permisos")
  })
})

describe("inviteUser", () => {
  beforeEach(() => jest.clearAllMocks())

  it("creates user and revalidates", async () => {
    const created = { id: "u-new", ...createInput }
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(true)
    mockInvite.mockResolvedValue(created)

    const data = await inviteUser(createInput)

    expect(mockInvite).toHaveBeenCalledWith(createInput, mockUser.id)
    expect(mockRevalidatePath).toHaveBeenCalledWith("/users")
    expect(data).toEqual(created)
  })
})

describe("updateUser", () => {
  beforeEach(() => jest.clearAllMocks())

  it("updates user and revalidates", async () => {
    const updated = { id: "u-1", full_name: "Updated" }
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(true)
    mockUpdate.mockResolvedValue(updated)

    const data = await updateUser(updateInput)

    expect(mockUpdate).toHaveBeenCalledWith(updateInput, mockUser.id)
    expect(mockRevalidatePath).toHaveBeenCalledWith("/users")
    expect(data).toEqual(updated)
  })
})

describe("deleteUser", () => {
  beforeEach(() => jest.clearAllMocks())

  it("deletes user (soft) and revalidates", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(true)
    mockDelete.mockResolvedValue(undefined)

    const result = await deleteUser("u-1")

    expect(result).toEqual({ ok: true })
    expect(mockDelete).toHaveBeenCalledWith("u-1", mockUser.id, { hardDelete: false })
    expect(mockRevalidatePath).toHaveBeenCalledWith("/users")
  })

  it("passes hardDelete through for an ADMIN caller", async () => {
    const admin = { ...mockUser, role: "ADMIN" }
    mockGetCurrentUser.mockResolvedValue(admin)
    mockCan.mockReturnValue(true)
    mockDelete.mockResolvedValue(undefined)

    await deleteUser("u-1", { hardDelete: true })

    expect(mockDelete).toHaveBeenCalledWith("u-1", admin.id, { hardDelete: true })
  })

  it("rejects hardDelete for a non-ADMIN caller even with MANAGE_USERS", async () => {
    const bursar = { ...mockUser, role: "BURSAR" }
    mockGetCurrentUser.mockResolvedValue(bursar)
    mockCan.mockReturnValue(true)

    await expect(deleteUser("u-1", { hardDelete: true })).resolves.toEqual({
      error: "Solo un administrador puede eliminar usuarios permanentemente"
    })
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it("returns the error message instead of throwing (prod redacts thrown messages)", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {})
    mockGetCurrentUser.mockResolvedValue({ ...mockUser, role: "ADMIN" })
    mockCan.mockReturnValue(true)
    mockDelete.mockRejectedValue(new Error("No se pudo eliminar permanentemente"))

    await expect(deleteUser("u-1", { hardDelete: true })).resolves.toEqual({
      error: "No se pudo eliminar permanentemente"
    })
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it("returns an error when unauthenticated", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {})
    mockGetCurrentUser.mockResolvedValue(null)
    mockCan.mockReturnValue(false)

    await expect(deleteUser("u-1")).resolves.toEqual({
      error: "Sin permisos para gestionar usuarios"
    })
  })
})

describe("getUserPurgePreview", () => {
  beforeEach(() => jest.clearAllMocks())

  const preview = {
    counts: { movements: 2 },
    foreign_reach: { movements: 0, transfers: 0, settlements: 0 },
    storage_paths: []
  }

  it("returns the preview for an ADMIN caller", async () => {
    const admin = { ...mockUser, role: "ADMIN" }
    mockGetCurrentUser.mockResolvedValue(admin)
    mockCan.mockReturnValue(true)
    mockPreviewPurge.mockResolvedValue(preview)

    await expect(getUserPurgePreview("u-1")).resolves.toEqual({ preview })
    expect(mockPreviewPurge).toHaveBeenCalledWith("u-1", admin.id)
  })

  it("rejects a non-ADMIN caller even with MANAGE_USERS", async () => {
    mockGetCurrentUser.mockResolvedValue({ ...mockUser, role: "BURSAR" })
    mockCan.mockReturnValue(true)

    await expect(getUserPurgePreview("u-1")).resolves.toEqual({
      error: "Solo un administrador puede eliminar usuarios permanentemente"
    })
    expect(mockPreviewPurge).not.toHaveBeenCalled()
  })

  it("returns the error message instead of throwing", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {})
    mockGetCurrentUser.mockResolvedValue({ ...mockUser, role: "ADMIN" })
    mockCan.mockReturnValue(true)
    mockPreviewPurge.mockRejectedValue(new Error("No puedes eliminar tu propia cuenta"))

    await expect(getUserPurgePreview("admin-1")).resolves.toEqual({
      error: "No puedes eliminar tu propia cuenta"
    })
  })
})
