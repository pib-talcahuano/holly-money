"use client"

import { useState, useMemo, useEffect, type ComponentProps } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { cn, avatarColorFor, initialsFor } from "@/lib/utils"
import type { UserRole } from "@/types/auth"
import {
  USER_ROLES,
  ROLE_ORDER,
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
import { inviteUser, updateUser, deleteUser, resendInvite, resetUser } from "@/app/actions/users"
import { startImpersonation } from "@/app/actions/impersonation"

type UserStatus = "ACTIVE" | "INACTIVE" | "PENDING_ACTIVATION" | "PENDING_RESET"

type UserRow = {
  id: string
  full_name: string
  email: string
  role: UserRole
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
        <Badge
          variant={ROLE_BADGE_VARIANT[user.role]}
          className="hidden sm:inline-flex uppercase tracking-wide"
        >
          {ROLE_LABEL[user.role]}
        </Badge>
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
        {user.role !== USER_ROLES.ADMIN && user.status === "ACTIVE" && (
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

export function UsersManager({ initialUsers }: { initialUsers: UserRow[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const inviteMinister = searchParams.get("invite") === USER_ROLES.MINISTER
  const [users, setUsers] = useState<UserRow[]>(initialUsers)
  const [createOpen, setCreateOpen] = useState(inviteMinister)
  const [editingUser, setEditingUser] = useState<UserRow | null>(null)
  const [deletingUser, setDeletingUser] = useState<UserRow | null>(null)
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
      members: filtered.filter((u) => u.role === role)
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
      role: inviteMinister ? USER_ROLES.MINISTER : USER_ROLES.BURSAR
    }
  })

  const selectedRole = useWatch({ control: createForm.control, name: "role" })

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

  function openEdit(user: UserRow) {
    setEditingUser(user)
    editForm.reset({
      id: user.id,
      full_name: user.full_name,
      role: user.role,
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

  const handleDelete = () => {
    if (!deletingUser) return
    const { id: userId, full_name: name } = deletingUser
    setDeletingUser(null)

    toast.promise(deleteUser(userId), {
      loading: "Eliminando usuario...",
      success: () => {
        setUsers((prev) => prev.filter((u) => u.id !== userId))
        return `${name} fue eliminado`
      },
      error: (e: Error) => e.message
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

              <Field>
                <FieldLabel htmlFor="new-role">Nivel de acceso</FieldLabel>
                <NativeSelect id="new-role" className="w-full" {...createForm.register("role")}>
                  <option value={USER_ROLES.ADMIN}>Administrador — Acceso total</option>
                  <option value={USER_ROLES.FINANCE}>Finanzas — Gestión contable</option>
                  <option value={USER_ROLES.BURSAR}>Tesorero — Ingreso y aprobación</option>
                  <option value={USER_ROLES.MINISTER}>Ministro — Solicitudes de fondos</option>
                </NativeSelect>
              </Field>

              {selectedRole === USER_ROLES.ADMIN && (
                <Alert variant="info">
                  <AlertTitle>Acceso total al sistema</AlertTitle>
                  <AlertDescription>
                    Puede invitar y eliminar usuarios, ver todos los movimientos, crear y anular
                    registros contables, y acceder a los reportes. Asigna este rol solo a personas
                    de plena confianza.
                  </AlertDescription>
                </Alert>
              )}
              {selectedRole === USER_ROLES.BURSAR && (
                <Alert variant="info">
                  <AlertTitle>Tesorero — Ingreso y aprobación</AlertTitle>
                  <AlertDescription>
                    Puede crear, editar y anular movimientos contables, y aprobar o rechazar
                    solicitudes de fondos de ministros. No puede gestionar usuarios ni configurar el
                    sistema.
                  </AlertDescription>
                </Alert>
              )}
              {selectedRole === USER_ROLES.FINANCE && (
                <Alert variant="info">
                  <AlertTitle>Finanzas — Monitoreo de registros</AlertTitle>
                  <AlertDescription>
                    Puede consultar movimientos y el flujo de solicitudes, pero no puede crear,
                    editar ni aprobar ningún registro. Rol de supervisión financiera.
                  </AlertDescription>
                </Alert>
              )}
              {selectedRole === USER_ROLES.MINISTER && (
                <Alert variant="info">
                  <AlertTitle>Solicitudes de fondos</AlertTitle>
                  <AlertDescription>
                    Puede enviar solicitudes de fondos para su ministerio y rendir los gastos
                    correspondientes. No tiene acceso a movimientos contables ni configuración.
                  </AlertDescription>
                </Alert>
              )}

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

      {/* Edit dialog */}
      <Dialog
        open={!!editingUser}
        onOpenChange={(o) => {
          if (!o) setEditingUser(null)
        }}
      >
        <DialogContent className="sm:max-w-[460px]">
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

              <Field>
                <FieldLabel htmlFor="edit-role">Rol</FieldLabel>
                <NativeSelect id="edit-role" className="w-full" {...editForm.register("role")}>
                  {ROLE_ORDER.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABEL[role]}
                    </option>
                  ))}
                </NativeSelect>
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
              <NativeSelect id="edit-status" className="w-full" {...editForm.register("status")}>
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
                  {editingUser.role !== USER_ROLES.ADMIN && editingUser.status === "ACTIVE" && (
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
                    className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => {
                      setDeletingUser(editingUser)
                      setEditingUser(null)
                    }}
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
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog
        open={!!deletingUser}
        onOpenChange={(o) => {
          if (!o) setDeletingUser(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-[17px] font-extrabold">Eliminar usuario</DialogTitle>
            <DialogDescription className="text-[12.5px]">
              ¿Eliminar a <strong>{deletingUser?.full_name}</strong> ({deletingUser?.email})? Esta
              acción no se puede deshacer. Se cancelará cualquier invitación pendiente.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setDeletingUser(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => void handleDelete()}>
              Sí, eliminar
            </Button>
          </div>
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
