import { previewPeopleMerge, mergePeople } from "../people"

const mockGetCurrentUser = jest.fn()
const mockDb = {}
const mockCan = jest.fn()
const mockPreview = jest.fn()
const mockMerge = jest.fn()
const mockRevalidatePath = jest.fn()

jest.mock("@/lib/supabase/server", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
  createSupabaseServerClient: () => Promise.resolve(mockDb)
}))

jest.mock("@/lib/permissions/rbac", () => ({
  PERMISSIONS: { MANAGE_PEOPLE: "MANAGE_PEOPLE" },
  can: (...args: unknown[]) => mockCan(...args),
  isImpersonating: (user: { impersonatorId?: string | null } | null) => !!user?.impersonatorId
}))

jest.mock("@/services/people/people.service", () => ({
  peopleService: {
    preview: (...args: unknown[]) => mockPreview(...args),
    merge: (...args: unknown[]) => mockMerge(...args)
  }
}))

jest.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidatePath(...args)
}))

const mockUser = { id: "user-1", permissions: ["MANAGE_PEOPLE"] }
const input = {
  movement_type: "INCOME" as const,
  from_names: ["mabel perez", "Mabel P."],
  to_name: "  Mabel Pérez  "
}
const serviceInput = {
  movementType: "INCOME",
  fromNames: ["mabel perez", "Mabel P."],
  toName: "Mabel Pérez"
}
const noPermission = { ok: false, error: "Sin permisos para unir nombres" }

describe.each([
  ["previewPeopleMerge", previewPeopleMerge, mockPreview],
  ["mergePeople", mergePeople, mockMerge]
] as const)("%s guards", (_name, action, mockService) => {
  beforeEach(() => jest.clearAllMocks())

  it("returns an error without a session", async () => {
    mockGetCurrentUser.mockResolvedValue(null)
    await expect(action(input)).resolves.toEqual(noPermission)
    expect(mockService).not.toHaveBeenCalled()
  })

  it("returns an error without MANAGE_PEOPLE, before validating", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(false)
    await expect(action({ ...input, from_names: [] })).resolves.toEqual(noPermission)
    expect(mockCan).toHaveBeenCalledWith(mockUser.permissions, "MANAGE_PEOPLE")
    expect(mockService).not.toHaveBeenCalled()
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it("is not available while impersonating, checked after permission and before validation", async () => {
    mockGetCurrentUser.mockResolvedValue({ ...mockUser, impersonatorId: "admin-1" })
    mockCan.mockReturnValue(true)
    await expect(action({ ...input, from_names: [] })).resolves.toEqual({
      ok: false,
      error: "No disponible mientras actúas como otro usuario"
    })
    expect(mockService).not.toHaveBeenCalled()
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it("reports missing permission first even while impersonating", async () => {
    mockGetCurrentUser.mockResolvedValue({ ...mockUser, impersonatorId: "admin-1" })
    mockCan.mockReturnValue(false)
    await expect(action(input)).resolves.toEqual(noPermission)
  })

  it("passes padded origin names to the service untrimmed", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(true)
    mockService.mockResolvedValue({ affected: 1, updated: 1 })
    await action({ ...input, from_names: ["  mabel perez ", "Mabel P."] })
    expect(mockService).toHaveBeenCalledWith(
      mockDb,
      expect.objectContaining({ fromNames: ["  mabel perez ", "Mabel P."] })
    )
  })

  it.each([
    ["empty origin list", { ...input, from_names: [] }, "Elige al menos un nombre"],
    ["empty target name", { ...input, to_name: "   " }, "Escribe el nombre final"],
    [
      "target name too long",
      { ...input, to_name: "a".repeat(101) },
      "El nombre final no puede superar 100 caracteres"
    ]
  ])("returns the validation message for %s", async (_label, bad, message) => {
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(true)
    await expect(action(bad)).resolves.toEqual({ ok: false, error: message })
    expect(mockService).not.toHaveBeenCalled()
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it("returns a service Error message", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(true)
    mockService.mockRejectedValue(new Error("Demasiados movimientos"))
    await expect(action(input)).resolves.toEqual({ ok: false, error: "Demasiados movimientos" })
  })

  it("returns a generic message for a non-Error and logs it", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {})
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(true)
    mockService.mockRejectedValue("boom")
    await expect(action(input)).resolves.toEqual({
      ok: false,
      error: "No se pudo completar la operación"
    })
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe("previewPeopleMerge", () => {
  beforeEach(() => jest.clearAllMocks())

  it("calls the service with normalized input and returns the count", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(true)
    mockPreview.mockResolvedValue({ affected: 7 })
    await expect(previewPeopleMerge(input)).resolves.toEqual({ ok: true, affected: 7 })
    expect(mockPreview).toHaveBeenCalledWith(mockDb, serviceInput)
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })
})

describe("mergePeople", () => {
  beforeEach(() => jest.clearAllMocks())

  it("merges with the user id and revalidates the three paths", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(true)
    mockMerge.mockResolvedValue({ updated: 4 })
    await expect(mergePeople(input)).resolves.toEqual({ ok: true, updated: 4 })
    expect(mockMerge).toHaveBeenCalledWith(mockDb, { ...serviceInput, userId: "user-1" })
    expect(mockRevalidatePath).toHaveBeenCalledWith("/people")
    expect(mockRevalidatePath).toHaveBeenCalledWith("/tithers")
    expect(mockRevalidatePath).toHaveBeenCalledWith("/movements")
  })

  it("still revalidates when the service fails (partial failure)", async () => {
    mockGetCurrentUser.mockResolvedValue(mockUser)
    mockCan.mockReturnValue(true)
    mockMerge.mockRejectedValue(new Error("Falló a medias"))
    await expect(mergePeople(input)).resolves.toEqual({ ok: false, error: "Falló a medias" })
    expect(mockRevalidatePath).toHaveBeenCalledTimes(3)
  })
})
