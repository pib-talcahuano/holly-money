"use client"

import { useState, useMemo, useEffect, type ComponentProps } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { cn, avatarColorFor, initialsFor } from "@/lib/utils"
import type { UserRole } from "@/types/auth"
import { RoleMultiSelect } from "@/components/users/role-multi-select"
import {
  USER_ROLES,
  ROLE_ORDER,
  hasRole,
  ROLE_LABEL,
  ROLE_BADGE_VARIANT,
  ROLE_DOT_CLASS
} from "@/lib/constants/roles"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog"
import { NativeSelect } from "@/components/ui/native-select"
import {
  UserRoundPlus,
  Users,
  Search,
  RotateCcw,
  Trash2,
  Send,
  Copy,
  Check,
  Link,
  Settings2,
  VenetianMask,
  LayoutList,
  List,
  ChevronDown,
  ChevronRight
} from "lucide-react"
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from "@/components/ui/empty"
import {
  Item,
  ItemGroup,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions
} from "@/components/ui/item"
import { Badge } from "@/components/ui/badge"
import { createUserSchema, updateUserSchema } from "@/lib/validators/user"
import type { CreateUserInput, UpdateUserInput } from "@/lib/validators/user"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Field, FieldLabel, FieldError } from "@/components/ui/field"
import { toast } from "sonner"
import {
  inviteUser,
  updateUser,
  deleteUser,
  getUserPurgePreview,
  resendInvite,
  resetUser
} from "@/app/actions/users"
import type { UserPurgePreview } from "@/services/users/users.service"
import { startImpersonation } from "@/app/actions/impersonation"
import { useUser } from "@/components/providers/user-provider"

type UserStatus = "ACTIVE" | "INACTIVE" | "PENDING_ACTIVATION" | "PENDING_RESET"

type UserRow = {
  id: string
  full_name: string
  email: string
  roles: UserRole[]
  status: UserStatus
  created_at: string | Date
  updated_at: string | Date | null
}

// Supabase's email-link expiry (otp_expiry in supabase/config.toml) is shared by every email
// link type — invite, magiclink, recovery — so both statuses expire after the same window.
const LINK_EXPIRY_MS = 2 * 24 * 60 * 60 * 1000

function isLinkExpired(user: UserRow): boolean {
  if (user.status !== "PENDING_ACTIVATION" && user.status !== "PENDING_RESET") return false
  const lastAction = Math.max(
    new Date(user.created_at).getTime(),
    user.updated_at ? new Date(user.updated_at).getTime() : 0
  )
  return Date.now() - lastAction > LINK_EXPIRY_MS
}

type BadgeVariant = ComponentProps<typeof Badge>["variant"]

type StatusMeta = {
  label: string
  variant: BadgeVariant | null
  rowOpacity: boolean
}

function statusMeta(status: UserStatus): StatusMeta {
  switch (status) {
    case "ACTIVE":
      return { label: "Activo", variant: null, rowOpacity: false }
    case "INACTIVE":
      return { label: "Inactivo", variant: "neutral", rowOpacity: true }
    case "PENDING_ACTIVATION":
      return { label: "Sin activar", variant: "warn", rowOpacity: false }
    case "PENDING_RESET":
      return { label: "Reset pendiente", variant: "expense", rowOpacity: false }
  }
}

function UserListItem({
  user,
  onOpen,
  onImpersonate
}: {
  user: UserRow
  onOpen: () => void
  onImpersonate: () => void
}) {
  const meta = statusMeta(user.status)
  const linkExpired = isLinkExpired(user)
  return (
    <Item
      variant="outline"
      onClick={onOpen}
      className={cn("cursor-pointer rounded-[14px] px-[18px]", meta.rowOpacity && "opacity-55")}
    >
      <div
        className="flex size-[38px] shrink-0 items-center justify-center rounded-[12px] text-[13px] font-extrabold text-white"
        style={{ background: avatarColorFor(user.full_name || user.email) }}
      >
        {initialsFor(user.full_name || "?")}
      </div>
      <ItemContent>
        <ItemTitle className="font-bold">{user.full_name}</ItemTitle>
        <ItemDescription className="text-[12.5px]">{user.email}</ItemDescription>
        <div className="sm:hidden mt-0.5 flex flex-wrap gap-1">
          {meta.variant && <Badge variant={meta.variant}>{meta.label}</Badge>}
          {linkExpired && <Badge variant="expense">Enlace expirado</Badge>}
        </div>
      </ItemContent>
      <ItemActions>
        {user.roles.map((role) => (
          <Badge
            key={role}
            variant={ROLE_BADGE_VARIANT[role]}
            className="hidden sm:inline-flex uppercase tracking-wide"
          >
            {ROLE_LABEL[role]}
          </Badge>
        ))}
        {meta.variant && (
          <Badge variant={meta.variant} className="hidden sm:inline-flex">
            {meta.label}
          </Badge>
        )}
        {linkExpired && (
          <Badge variant="expense" className="hidden sm:inline-flex">
            Enlace expirado
          </Badge>
        )}
        {!hasRole(user, USER_ROLES.ADMIN) && user.status === "ACTIVE" && (
          <Button
            size="icon-sm"
            variant="outline"
            onClick={(e) => {
              e.stopPropagation()
              onImpersonate()
            }}
            title="Impersonar"
          >
            <VenetianMask className="size-3.5" />
          </Button>
        )}
        <Button size="icon-sm" variant="outline" onClick={onOpen} title="Editar usuario">
          <Settings2 className="size-3.5" />
        </Button>
      </ItemActions>
    </Item>
  )
}

const PURGE_LABELS: Record<string, string> = {
  movements: "Movimientos",
  movement_attachments: "Adjuntos de movimientos",
  movement_audit_entries: "Registros de auditoría de movimientos",
  intentions: "Intenciones",
  intention_attachments: "Adjuntos de intenciones",
  transfers: "Transferencias",
  settlements: "Rendiciones",
  settlement_attachments: "Adjuntos de rendiciones",
  comments: "Comentarios",
  payroll_records: "Registros de remuneraciones",
  severance_adjustments: "Ajustes de reserva de finiquitos",
  ministry_assignments: "Asignaciones a ministerios",
  ministry_delegates: "Delegaciones",
  system_audit_entries: "Registros de auditoría del sistema"
}

const ROLE_HELP: Partial<Record<UserRole, { title: string; description: string }>> = {
  ADMIN: {
    title: "Acceso total al sistema",
    description:
      "Puede invitar y eliminar usuarios, ver todos los movimientos, crear y anular registros contables, y acceder a los reportes. Asigna este rol solo a personas de plena confianza."
  },
  BURSAR: {
    title: "Tesorero — Ingreso y aprobación",
    description:
      "Puede crear, editar y anular movimientos contables, y aprobar o rechazar solicitudes de fondos de ministros. No puede gestionar usuarios ni configurar el sistema."
  },
  FINANCE: {
    title: "Finanzas — Monitoreo de registros",
    description:
      "Puede consultar movimientos y el flujo de solicitudes, pero no puede crear, editar ni aprobar ningún registro. Rol de supervisión financiera."
  },
  MINISTER: {
    title: "Solicitudes de fondos",
    description:
      "Puede enviar solicitudes de fondos para su ministerio y rendir los gastos correspondientes. No tiene acceso a movimientos contables ni configuración."
  }
}

export function UsersManager({ initialUsers }: { initialUsers: UserRow[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentUser = useUser()
  const inviteMinister = searchParams.get("invite") === USER_ROLES.MINISTER
  const [users, setUsers] = useState<UserRow[]>(initialUsers)
  const [createOpen, setCreateOpen] = useState(inviteMinister)
  const [editingUser, setEditingUser] = useState<UserRow | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [hardDelete, setHardDelete] = useState(false)
  const [purgePreview, setPurgePreview] = useState<UserPurgePreview | null>(null)
  const [purgePreviewError, setPurgePreviewError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [search, setSearch] = useState("")
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)
  const [viewMode, setViewMode] = useState<"grouped" | "flat">("grouped")
  const [collapsedRoles, setCollapsedRoles] = useState<Set<UserRole>>(new Set())

  useEffect(() => {
    const stored = window.localStorage.getItem("users-view-mode")
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing initial state from a client-only store (localStorage) can't be done during render because `window` doesn't exist during SSR
    if (stored === "flat" || stored === "grouped") setViewMode(stored)
  }, [])

  useEffect(() => {
    window.localStorage.setItem("users-view-mode", viewMode)
  }, [viewMode])

  function copyInviteLink() {
    if (!inviteLink) return
    navigator.clipboard.writeText(inviteLink).then(() => {
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    })
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return users
    const q = search.toLowerCase()
    return users.filter(
      (u) => u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    )
  }, [users, search])

  const groups = useMemo(() => {
    return ROLE_ORDER.map((role) => ({
      role,
      members: filtered.filter((u) => u.roles.includes(role))
    })).filter((g) => g.members.length > 0)
  }, [filtered])

  function toggleRoleCollapsed(role: UserRole) {
    setCollapsedRoles((prev) => {
      const next = new Set(prev)
      if (next.has(role)) next.delete(role)
      else next.add(role)
      return next
    })
  }

  const createForm = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      full_name: "",
      email: "",
      roles: inviteMinister ? [USER_ROLES.MINISTER] : [USER_ROLES.BURSAR]
    }
  })

  const selectedRoles = useWatch({ control: createForm.control, name: "roles" }) ?? []

  const handleCreate = (values: CreateUserInput) => {
    const promise = inviteUser(values)

    toast.promise(promise, {
      loading: "Enviando invitación...",
      success: (created) => {
        setUsers((prev) => [...prev, created as unknown as UserRow])
        createForm.reset()
        setCreateOpen(false)
        if (created.invite_link) {
          setLinkCopied(false)
          setInviteLink(created.invite_link)
        }
        return `Invitación enviada a ${created.email}`
      },
      error: (e: Error) => e.message
    })
  }

  const editForm = useForm<UpdateUserInput>({
    resolver: zodResolver(updateUserSchema)
  })

  const editRoles = useWatch({ control: editForm.control, name: "roles" }) ?? []

  function openEdit(user: UserRow) {
    setEditingUser(user)
    setConfirmDelete(false)
    setHardDelete(false)
    editForm.reset({
      id: user.id,
      full_name: user.full_name,
      roles: user.roles,
      status: user.status
    })
  }

  const handleUpdate = (values: UpdateUserInput) => {
    const promise = updateUser(values)

    toast.promise(promise, {
      loading: "Guardando cambios...",
      success: (updated) => {
        setUsers((prev) => prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)))
        setEditingUser(null)
        return "Usuario actualizado"
      },
      error: (e: Error) => e.message
    })
  }

  const resetDeleteState = () => {
    setConfirmDelete(false)
    setHardDelete(false)
    setPurgePreview(null)
    setPurgePreviewError(null)
  }

  const handleHardDeleteToggle = (checked: boolean) => {
    setHardDelete(checked)
    setPurgePreview(null)
    setPurgePreviewError(null)
    if (!checked || !editingUser) return
    const userId = editingUser.id
    void getUserPurgePreview(userId).then((result) => {
      if ("error" in result) setPurgePreviewError(result.error)
      else setPurgePreview(result.preview)
    })
  }

  const handleDelete = () => {
    if (!editingUser || isDeleting) return
    const { id: userId, full_name: name } = editingUser
    const wantsHardDelete = hardDelete && hasRole(currentUser, USER_ROLES.ADMIN)
    setIsDeleting(true)

    const request = deleteUser(userId, { hardDelete: wantsHardDelete }).then((result) => {
      if ("error" in result) throw new Error(result.error)
    })

    toast.promise(request, {
      loading: wantsHardDelete ? "Eliminando usuario permanentemente..." : "Eliminando usuario...",
      success: () => {
        setUsers((prev) => prev.filter((u) => u.id !== userId))
        setEditingUser(null)
        resetDeleteState()
        setIsDeleting(false)
        return `${name} fue eliminado`
      },
      error: (e: Error) => {
        setIsDeleting(false)
        return e.message
      }
    })
  }

  const handleResendInvite = (userId: string) => {
    toast.promise(resendInvite(userId), {
      loading: "Reenviando invitación...",
      success: (data) => {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, updated_at: new Date().toISOString() } : u))
        )
        if (data?.invite_link) {
          setLinkCopied(false)
          setInviteLink(data.invite_link)
        }
        return "Invitación reenviada correctamente"
      },
      error: (e: Error) => e.message
    })
  }

  const handleImpersonate = (userId: string) => {
    toast.promise(startImpersonation(userId), {
      loading: "Iniciando suplantación...",
      success: () => {
        setEditingUser(null)
        router.push("/dashboard")
        router.refresh()
        return "Ahora estás viendo la aplicación como este usuario"
      },
      error: (e: Error) => e.message
    })
  }

  const handleReset = (userId: string) => {
    toast.promise(resetUser(userId), {
      loading: "Enviando correo de restablecimiento...",
      success: () => {
        setUsers((prev) =>
          prev.map((u) =>
            u.id === userId
              ? {
                  ...u,
                  status: "PENDING_RESET" as UserStatus,
                  updated_at: new Date().toISOString()
                }
              : u
          )
        )
        return "Correo de restablecimiento enviado"
      },
      error: (e: Error) => e.message
    })
  }

  return (
    <div className="flex flex-col gap-3.5">
      {/* Search + invite */}
      <div className="flex gap-3 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Buscar por nombre o correo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-[42px] rounded-[10px] text-[13.5px]"
          />
        </div>

        <Dialog
          open={createOpen}
          onOpenChange={(o) => {
            setCreateOpen(o)
            if (!o) createForm.reset()
          }}
        >
          <DialogTrigger
            render={
              <Button className="h-11 px-5 shrink-0 rounded-full">
                <UserRoundPlus className="size-4" />
                Crear usuario
              </Button>
            }
          />
          <DialogContent className="sm:max-w-[460px]">
            <DialogHeader>
              <DialogTitle className="text-[17px] font-extrabold">Crear usuario</DialogTitle>
              <DialogDescription className="text-[12.5px]">
                Se enviará un correo de activación. El usuario establecerá su propia contraseña.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={createForm.handleSubmit(handleCreate)} className="space-y-3 pt-2">
              <Field data-invalid={!!createForm.formState.errors.full_name || undefined}>
                <FieldLabel htmlFor="new-full_name">Nombre completo</FieldLabel>
                <Input
                  id="new-full_name"
                  placeholder="Ej: Juan Pérez"
                  aria-invalid={!!createForm.formState.errors.full_name}
                  {...createForm.register("full_name")}
                />
                <FieldError errors={[createForm.formState.errors.full_name]} />
              </Field>

              <Field data-invalid={!!createForm.formState.errors.email || undefined}>
                <FieldLabel htmlFor="new-email">Correo electrónico</FieldLabel>
                <Input
                  id="new-email"
                  type="email"
                  placeholder="usuario@ejemplo.com"
                  aria-invalid={!!createForm.formState.errors.email}
                  {...createForm.register("email")}
                />
                <FieldError errors={[createForm.formState.errors.email]} />
              </Field>

              <Field data-invalid={!!createForm.formState.errors.roles || undefined}>
                <FieldLabel htmlFor="new-role">Nivel de acceso</FieldLabel>
                <RoleMultiSelect
                  id="new-role"
                  value={selectedRoles}
                  onChange={(roles) =>
                    createForm.setValue("roles", roles, { shouldValidate: true })
                  }
                />
                <FieldError errors={[createForm.formState.errors.roles]} />
              </Field>

              {selectedRoles.map((role) => {
                const help = ROLE_HELP[role]
                return help ? (
                  <Alert key={role} variant="info">
                    <AlertTitle>{help.title}</AlertTitle>
                    <AlertDescription>{help.description}</AlertDescription>
                  </Alert>
                ) : null
              })}

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-1">
                <Button variant="outline" type="button" onClick={() => setCreateOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={createForm.formState.isSubmitting}>
                  <Send className="size-3.5" />
                  {createForm.formState.isSubmitting
                    ? "Enviando invitación..."
                    : "Enviar invitación"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Count + view toggle */}
      <div className="flex items-center justify-between">
        <p className="text-[12.5px] font-semibold text-muted-foreground">
          {filtered.length} integrante{filtered.length !== 1 ? "s" : ""}
          {search && ` — filtrando por "${search}"`}
        </p>
        <div className="flex gap-0.5 rounded-[11px] bg-muted p-0.5">
          <button
            type="button"
            onClick={() => setViewMode("grouped")}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-[9px] px-3 text-xs font-semibold transition-colors",
              viewMode === "grouped"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <LayoutList className="size-3.5" />
            Por rol
          </button>
          <button
            type="button"
            onClick={() => setViewMode("flat")}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-[9px] px-3 text-xs font-semibold transition-colors",
              viewMode === "flat"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <List className="size-3.5" />
            Lista
          </button>
        </div>
      </div>

      {/* Edit dialog (also hosts the delete confirmation as an in-place view, so there is
          only ever one dialog open — never two stacked/transitioning at once) */}
      <Dialog
        open={!!editingUser}
        onOpenChange={(o) => {
          if (!o && !isDeleting) {
            setEditingUser(null)
            resetDeleteState()
          }
        }}
      >
        <DialogContent className="sm:max-w-[460px]">
          {confirmDelete ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-[17px] font-extrabold">Eliminar usuario</DialogTitle>
                <DialogDescription className="text-[12.5px]">
                  ¿Eliminar a <strong>{editingUser?.full_name}</strong> ({editingUser?.email})? Esta
                  acción no se puede deshacer. Se cancelará cualquier invitación pendiente.
                </DialogDescription>
              </DialogHeader>

              {hasRole(currentUser, USER_ROLES.ADMIN) && (
                <label className="flex items-start gap-2 text-[12.5px] cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4"
                    disabled={isDeleting}
                    checked={hardDelete}
                    onChange={(e) => handleHardDeleteToggle(e.target.checked)}
                  />
                  <span>
                    Eliminar permanentemente (borra el usuario y todos sus registros)
                    <span className="block text-[11px] font-normal text-muted-foreground">
                      Elimina también los movimientos, intenciones, rendiciones, adjuntos y demás
                      registros asociados. No se puede deshacer. La opción estándar desactiva la
                      cuenta y conserva el historial.
                    </span>
                  </span>
                </label>
              )}

              {hardDelete && (
                <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-[12px]">
                  {purgePreviewError ? (
                    <p className="text-destructive">{purgePreviewError}</p>
                  ) : !purgePreview ? (
                    <p className="text-muted-foreground">Calculando registros a eliminar...</p>
                  ) : (
                    <>
                      <p className="font-semibold">Se eliminará permanentemente:</p>
                      <ul className="list-disc pl-5">
                        {Object.entries(purgePreview.counts)
                          .filter(([, n]) => n > 0)
                          .map(([key, n]) => (
                            <li key={key}>
                              {PURGE_LABELS[key] ?? key}: {n}
                            </li>
                          ))}
                        {Object.values(purgePreview.counts).every((n) => n === 0) && (
                          <li>Solo la cuenta (no tiene otros registros)</li>
                        )}
                      </ul>
                      {purgePreview.storage_paths.length > 0 && (
                        <p>{purgePreview.storage_paths.length} archivos adjuntos serán borrados.</p>
                      )}
                      {(purgePreview.foreign_reach.movements > 0 ||
                        purgePreview.foreign_reach.transfers > 0 ||
                        purgePreview.foreign_reach.settlements > 0) && (
                        <p className="font-semibold text-destructive">
                          Incluye registros de otros usuarios vinculados:{" "}
                          {purgePreview.foreign_reach.movements} movimientos,{" "}
                          {purgePreview.foreign_reach.transfers} transferencias y{" "}
                          {purgePreview.foreign_reach.settlements} rendiciones.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}

              <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
                <Button variant="outline" disabled={isDeleting} onClick={resetDeleteState}>
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  disabled={isDeleting || (hardDelete && !purgePreview)}
                  onClick={() => void handleDelete()}
                >
                  {isDeleting
                    ? "Eliminando..."
                    : hardDelete
                      ? "Sí, eliminar permanentemente"
                      : "Sí, eliminar"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="text-[17px] font-extrabold">Editar usuario</DialogTitle>
                <DialogDescription className="text-[12.5px]">
                  Modifica los datos del usuario o realiza acciones sobre su cuenta.
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={editForm.handleSubmit(handleUpdate)} className="space-y-4 pt-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field data-invalid={!!editForm.formState.errors.full_name || undefined}>
                    <FieldLabel htmlFor="edit-full_name">Nombre</FieldLabel>
                    <Input
                      id="edit-full_name"
                      aria-invalid={!!editForm.formState.errors.full_name}
                      {...editForm.register("full_name")}
                    />
                    <FieldError errors={[editForm.formState.errors.full_name]} />
                  </Field>

                  <Field data-invalid={!!editForm.formState.errors.roles || undefined}>
                    <FieldLabel htmlFor="edit-role">Roles</FieldLabel>
                    {editingUser?.roles.includes(USER_ROLES.DELEGATE) ? (
                      <Badge variant={ROLE_BADGE_VARIANT[USER_ROLES.DELEGATE]}>
                        {ROLE_LABEL[USER_ROLES.DELEGATE]}
                      </Badge>
                    ) : (
                      <RoleMultiSelect
                        id="edit-role"
                        value={editRoles}
                        onChange={(roles) =>
                          editForm.setValue("roles", roles, { shouldValidate: true })
                        }
                      />
                    )}
                    <FieldError errors={[editForm.formState.errors.roles]} />
                  </Field>
                </div>

                <Field>
                  <FieldLabel htmlFor="edit-email">Correo</FieldLabel>
                  <div
                    id="edit-email"
                    className="flex h-9 items-center rounded-md border border-transparent bg-muted px-2.5 text-sm text-muted-foreground"
                  >
                    {editingUser?.email}
                  </div>
                </Field>

                <Field>
                  <FieldLabel htmlFor="edit-status">Estado de cuenta</FieldLabel>
                  <NativeSelect
                    id="edit-status"
                    className="w-full"
                    {...editForm.register("status")}
                  >
                    <option value="ACTIVE">Activo</option>
                    <option value="INACTIVE">Inactivo</option>
                  </NativeSelect>
                </Field>

                {editingUser && (
                  <div className="border-t border-border pt-4 space-y-2.5">
                    <h3 className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                      Acciones de cuenta
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {!hasRole(editingUser, USER_ROLES.ADMIN) &&
                        editingUser.status === "ACTIVE" && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleImpersonate(editingUser.id)}
                          >
                            <VenetianMask className="size-3.5" />
                            Impersonar
                          </Button>
                        )}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void handleReset(editingUser.id)}
                      >
                        <RotateCcw className="size-3.5" />
                        Resetear contraseña
                      </Button>
                      {editingUser.status === "PENDING_ACTIVATION" && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void handleResendInvite(editingUser.id)}
                        >
                          <Send className="size-3.5" />
                          Reenviar invitación
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        disabled={isDeleting}
                        className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setConfirmDelete(true)}
                      >
                        <Trash2 className="size-3.5" />
                        Eliminar usuario
                      </Button>
                    </div>
                  </div>
                )}

                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
                  <Button variant="outline" type="button" onClick={() => setEditingUser(null)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={editForm.formState.isSubmitting}>
                    {editForm.formState.isSubmitting ? "Guardando..." : "Guardar cambios"}
                  </Button>
                </div>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Invite link dialog */}
      <Dialog
        open={!!inviteLink}
        onOpenChange={(o) => {
          if (!o) setInviteLink(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[17px] font-extrabold">
              <Link className="size-4 text-primary shrink-0" />
              Enlace de invitación
            </DialogTitle>
            <DialogDescription className="text-[12.5px]">
              Comparte este enlace con el usuario para que active su cuenta. Expira en{" "}
              <strong>2 días</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 items-center pt-2">
            <Input
              readOnly
              value={inviteLink ?? ""}
              className="h-11 bg-muted border-none rounded-xl px-4 text-sm font-mono truncate"
              onFocus={(e) => e.target.select()}
            />
            <Button
              variant={linkCopied ? "outline" : "default"}
              onClick={copyInviteLink}
              className="h-11 px-4 shrink-0 gap-1.5"
            >
              {linkCopied ? (
                <>
                  <Check className="size-4" />
                  Copiado
                </>
              ) : (
                <>
                  <Copy className="size-4" />
                  Copiar
                </>
              )}
            </Button>
          </div>
          <Button variant="outline" className="w-full" onClick={() => setInviteLink(null)}>
            Cerrar
          </Button>
        </DialogContent>
      </Dialog>

      {/* User list */}
      {users.length === 0 ? (
        <Card className="p-0 overflow-hidden">
          <Empty className="border-0 py-16">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Users />
              </EmptyMedia>
              <EmptyTitle>Sin usuarios</EmptyTitle>
              <EmptyDescription>
                No hay usuarios registrados en el equipo ministerial.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </Card>
      ) : filtered.length === 0 ? (
        <Empty className="border-dashed py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Search />
            </EmptyMedia>
            <EmptyTitle>Sin resultados</EmptyTitle>
            <EmptyDescription>No hay usuarios que coincidan con la búsqueda.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : viewMode === "flat" ? (
        <ItemGroup>
          {filtered.map((user) => (
            <UserListItem
              key={user.id}
              user={user}
              onOpen={() => openEdit(user)}
              onImpersonate={() => handleImpersonate(user.id)}
            />
          ))}
        </ItemGroup>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => {
            const collapsed = collapsedRoles.has(group.role)
            return (
              <div key={group.role}>
                <button
                  type="button"
                  onClick={() => toggleRoleCollapsed(group.role)}
                  className="mb-2.5 flex w-full select-none items-center gap-[10px]"
                >
                  {collapsed ? (
                    <ChevronRight className="size-[15px] shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="size-[15px] shrink-0 text-muted-foreground" />
                  )}
                  <span className={cn("size-2 rounded-full", ROLE_DOT_CLASS[group.role])} />
                  <span className="text-[13px] font-extrabold">{ROLE_LABEL[group.role]}</span>
                  <span className="rounded-full bg-muted px-[9px] py-0.5 text-[11.5px] font-bold text-muted-foreground">
                    {group.members.length}
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </button>
                {!collapsed && (
                  <ItemGroup>
                    {group.members.map((user) => (
                      <UserListItem
                        key={user.id}
                        user={user}
                        onOpen={() => openEdit(user)}
                        onImpersonate={() => handleImpersonate(user.id)}
                      />
                    ))}
                  </ItemGroup>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
