"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import {
  ArrowLeft,
  ArrowLeftRight,
  BadgeCheck,
  CheckCircle2,
  ClipboardList,
  HandCoins,
  Pencil,
  TrendingDown,
  UserPlus,
  UserMinus,
  UserRound,
  X
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
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
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from "@/components/ui/empty"
import { Field, FieldLabel, FieldError } from "@/components/ui/field"
import { Marker, MarkerIcon, MarkerContent } from "@/components/ui/marker"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { formatDate, formatCLP, avatarColorFor, initialsFor } from "@/lib/utils"
import {
  updateMinistrySchema,
  assignMinisterSchema,
  inviteDelegateSchema
} from "@/lib/validators/ministry"
import type {
  UpdateMinistryInput,
  AssignMinisterInput,
  InviteDelegateInput
} from "@/lib/validators/ministry"
import {
  assignMinister,
  unassignMinister,
  updateMinistry,
  inviteDelegate,
  removeDelegate
} from "@/app/actions/ministries"
import { USER_ROLES } from "@/lib/constants/roles"
import type { MinistryLeftoverRow } from "@/services/ministries/ministry-leftover.service"
import type { intentionsService } from "@/services/intentions/intentions.service"
import type { ministriesService } from "@/services/ministries/ministries.service"
import { NewRequestDialog } from "@/components/intentions/new-request-dialog"

type Ministry = {
  id: string
  name: string
  description: string | null
  is_active: boolean
  created_at: string
  created_by_user?: { full_name: string } | null
}

type MinistryUser = {
  id: string
  full_name: string
  email: string
  role: string
}

type Assignment = {
  id: string
  user_id: string
  assigned_at: string
  unassigned_at: string | null
  users: { id: string; full_name: string; email: string } | null
}

type Delegate = {
  id: string
  user_id: string
  created_at: string
  users: { id: string; full_name: string; email: string } | null
}

type MinistryIntention = Awaited<ReturnType<typeof intentionsService.list>>[number]
type AssociatedMovement = Awaited<
  ReturnType<typeof ministriesService.getAssociatedMovements>
>[number]

type Props = {
  ministry: Ministry
  users: MinistryUser[]
  assignments: Assignment[]
  currentAssignment: Assignment | null
  delegates: Delegate[]
  leftover: MinistryLeftoverRow[]
  intentions: MinistryIntention[]
  associatedMovements: AssociatedMovement[]
  canManage: boolean
  isAssignedMinister: boolean
  canCreateRequest: boolean
}

const INTENTION_STATUS_BADGE = {
  DRAFT: { variant: "neutral" as const, label: "Borrador" },
  PENDING: { variant: "warn" as const, label: "Pendiente" },
  APPROVED: { variant: "income" as const, label: "Aprobada" },
  REJECTED: { variant: "expense" as const, label: "Rechazada" },
  CANCELLED: { variant: "neutral" as const, label: "Cancelada" }
}

export function MinistryDetailClient({
  ministry: initialMinistry,
  users,
  assignments: initialAssignments,
  currentAssignment: initialCurrent,
  delegates: initialDelegates,
  leftover,
  intentions,
  associatedMovements,
  canManage,
  isAssignedMinister,
  canCreateRequest
}: Props) {
  const router = useRouter()
  const [ministry, setMinistry] = useState<Ministry>(initialMinistry)
  const [assignments, setAssignments] = useState<Assignment[]>(initialAssignments)
  const [current, setCurrent] = useState<Assignment | null>(initialCurrent)
  const [delegates, setDelegates] = useState<Delegate[]>(initialDelegates)
  const [editOpen, setEditOpen] = useState(false)
  const [unassignConfirmOpen, setUnassignConfirmOpen] = useState(false)
  const [unassigning, setUnassigning] = useState(false)
  const [changeMinisterOpen, setChangeMinisterOpen] = useState(false)
  const [addDelegateOpen, setAddDelegateOpen] = useState(false)

  const canManageDelegates = canManage || isAssignedMinister

  const ministers = users.filter((u) => u.role === USER_ROLES.MINISTER)
  const availableMinsters = ministers.filter((u) => u.id !== current?.user_id)

  const totalTransferred = leftover.reduce((sum, row) => sum + row.transferred_amount, 0)
  const totalSettled = leftover.reduce((sum, row) => sum + row.settled_amount, 0)
  const settledPct = totalTransferred > 0 ? Math.round((totalSettled / totalTransferred) * 100) : 0
  const totalLeftover = leftover.reduce((sum, row) => sum + row.leftover, 0)
  const pendingCount = intentions.filter((i) => i.status === "PENDING").length
  const approvedCount = intentions.filter((i) => i.status === "APPROVED").length
  const rejectedCount = intentions.filter((i) => i.status === "REJECTED").length

  const assignForm = useForm<AssignMinisterInput>({
    resolver: zodResolver(assignMinisterSchema),
    defaultValues: { user_id: "", notes: "" }
  })

  const editForm = useForm<UpdateMinistryInput>({
    resolver: zodResolver(updateMinistrySchema),
    defaultValues: {
      name: ministry.name,
      description: ministry.description ?? "",
      is_active: ministry.is_active
    }
  })

  async function handleAssign(values: AssignMinisterInput) {
    try {
      const result = await assignMinister(ministry.id, {
        user_id: values.user_id,
        notes: values.notes?.trim() || undefined
      })
      const assignedUser = users.find((u) => u.id === values.user_id)
      const newAssignment: Assignment = {
        id: (result as { id: string }).id,
        user_id: values.user_id,
        assigned_at: new Date().toISOString(),
        unassigned_at: null,
        users: assignedUser
          ? { id: assignedUser.id, full_name: assignedUser.full_name, email: assignedUser.email }
          : null
      }
      if (current) {
        setAssignments((prev) =>
          prev.map((a) =>
            a.id === current.id ? { ...a, unassigned_at: new Date().toISOString() } : a
          )
        )
      }
      setCurrent(newAssignment)
      setAssignments((prev) => [
        newAssignment,
        ...prev.filter((a) => a.id !== current?.id),
        ...(current ? [{ ...current, unassigned_at: new Date().toISOString() }] : [])
      ])
      assignForm.reset()
      setChangeMinisterOpen(false)
      toast.success("Ministro asignado")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al asignar")
    }
  }

  async function handleUnassign() {
    setUnassigning(true)
    try {
      await unassignMinister(ministry.id)
      if (current) {
        const closed = { ...current, unassigned_at: new Date().toISOString() }
        setAssignments((prev) => prev.map((a) => (a.id === current.id ? closed : a)))
      }
      setCurrent(null)
      setUnassignConfirmOpen(false)
      toast.success("Ministro desasignado")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al desasignar")
    } finally {
      setUnassigning(false)
    }
  }

  async function handleEdit(values: UpdateMinistryInput) {
    try {
      const updated = await updateMinistry(ministry.id, {
        name: values.name?.trim(),
        description: values.description?.trim() || undefined,
        is_active: values.is_active
      })
      setMinistry((prev) => ({ ...prev, ...(updated as unknown as Ministry) }))
      setEditOpen(false)
      toast.success("Ministerio actualizado")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar")
    }
  }

  const delegateForm = useForm<InviteDelegateInput>({
    resolver: zodResolver(inviteDelegateSchema),
    defaultValues: { full_name: "", email: "" }
  })

  async function handleInviteDelegate(values: InviteDelegateInput) {
    try {
      const created = await inviteDelegate(ministry.id, values)
      setDelegates((prev) => [created as unknown as Delegate, ...prev])
      delegateForm.reset({ full_name: "", email: "" })
      setAddDelegateOpen(false)
      toast.success("Delegado invitado")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al invitar delegado")
    }
  }

  async function handleRemoveDelegate(delegateId: string) {
    try {
      await removeDelegate(delegateId, ministry.id)
      setDelegates((prev) => prev.filter((d) => d.id !== delegateId))
      toast.success("Delegado eliminado")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al quitar delegado")
    }
  }

  const pickedUserId = useWatch({ control: assignForm.control, name: "user_id" })

  const changeMinisterDialog = (
    <Dialog
      open={changeMinisterOpen}
      onOpenChange={(o) => {
        setChangeMinisterOpen(o)
        if (!o) assignForm.reset({ user_id: "", notes: "" })
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cambiar ministro</DialogTitle>
          <DialogDescription>
            El ministro actual quedará desasignado y el cambio se registrará en el historial.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={assignForm.handleSubmit(handleAssign)} className="flex flex-col gap-4 pt-2">
          {current?.users && (
            <div className="flex flex-col gap-2">
              <FieldLabel>Ministro actual</FieldLabel>
              <div className="flex items-center gap-3 rounded-[11px] border border-border bg-muted px-3 py-2.5">
                <div
                  className="flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold text-white"
                  style={{ background: avatarColorFor(current.users.full_name) }}
                >
                  {initialsFor(current.users.full_name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold truncate">{current.users.full_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{current.users.email}</p>
                </div>
                <Badge variant="warn" className="shrink-0">
                  Se desasignará
                </Badge>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <FieldLabel>Nuevo ministro *</FieldLabel>
            {availableMinsters.length === 0 ? (
              <div className="flex items-center justify-between rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
                <span>No hay ministros disponibles</span>
                <Button
                  variant="ghost"
                  render={<Link href="/users?invite=MINISTER" />}
                  nativeButton={false}
                >
                  <UserPlus className="size-4" />
                  Crear ministro
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {availableMinsters.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => assignForm.setValue("user_id", u.id, { shouldValidate: true })}
                    className={`flex items-center gap-3 rounded-[11px] border px-3 py-2.5 text-left transition-colors ${
                      pickedUserId === u.id
                        ? "border-primary bg-primary-soft"
                        : "border-border bg-card hover:bg-muted"
                    }`}
                  >
                    <div
                      className="flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold text-white"
                      style={{ background: avatarColorFor(u.full_name) }}
                    >
                      {initialsFor(u.full_name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold truncate">{u.full_name}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    </div>
                    {pickedUserId === u.id && (
                      <CheckCircle2 className="size-4 text-primary shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
            <FieldError errors={[assignForm.formState.errors.user_id]} />
          </div>

          <Field>
            <FieldLabel htmlFor="change-minister-notes">Notas</FieldLabel>
            <Input
              id="change-minister-notes"
              placeholder="Motivo del cambio (opcional)"
              {...assignForm.register("notes")}
            />
          </Field>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setChangeMinisterOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!pickedUserId || assignForm.formState.isSubmitting}>
              <UserPlus className="size-4" />
              Asignar ministro
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )

  const assignMinisterForm = (
    <form onSubmit={assignForm.handleSubmit(handleAssign)} className="flex flex-col gap-2">
      {availableMinsters.length === 0 ? (
        <div className="flex items-center justify-between rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
          <span>No hay ministros disponibles</span>
          <Button
            variant="ghost"
            render={<Link href="/users?invite=MINISTER" />}
            nativeButton={false}
          >
            <UserPlus className="size-4" />
            Crear ministro
          </Button>
        </div>
      ) : (
        <>
          <NativeSelect className="w-full" {...assignForm.register("user_id")} defaultValue="">
            <NativeSelectOption value="">Seleccionar ministro…</NativeSelectOption>
            {availableMinsters.map((u) => (
              <NativeSelectOption key={u.id} value={u.id}>
                {u.full_name} — {u.email}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldError errors={[assignForm.formState.errors.user_id]} />
          <Input placeholder="Notas opcionales" {...assignForm.register("notes")} />
          <Button type="submit" disabled={assignForm.formState.isSubmitting}>
            <UserPlus className="size-4" />
            Asignar
          </Button>
        </>
      )}
    </form>
  )

  return (
    <div className="space-y-6">
      <Button
        variant="ghost"
        className="-ml-2"
        render={<Link href={canManage ? "/ministries" : "/requests"} />}
        nativeButton={false}
      >
        <ArrowLeft className="size-4" />
        {canManage ? "Volver a ministerios" : "Volver a solicitudes"}
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div
            className="flex size-[52px] shrink-0 items-center justify-center rounded-[15px] text-[16px] font-extrabold text-white"
            style={{ background: avatarColorFor(ministry.name) }}
          >
            {initialsFor(ministry.name)}
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="font-heading text-2xl font-extrabold tracking-tight text-foreground">
                {ministry.name}
              </h1>
              <Badge variant={ministry.is_active ? "income" : "neutral"}>
                {ministry.is_active ? "Activo" : "Inactivo"}
              </Badge>
            </div>
            {ministry.description && (
              <p className="text-[13.5px] text-muted-foreground">{ministry.description}</p>
            )}
          </div>
        </div>

        {(canManage || canCreateRequest) && (
          <div className="flex items-center gap-3">
            {canCreateRequest && <NewRequestDialog onCreated={() => router.refresh()} />}
            {canManage && (
              <>
                <Dialog
                  open={editOpen}
                  onOpenChange={(o) => {
                    setEditOpen(o)
                    if (!o)
                      editForm.reset({
                        name: ministry.name,
                        description: ministry.description ?? "",
                        is_active: ministry.is_active
                      })
                  }}
                >
                  <DialogTrigger
                    render={
                      <Button variant="outline">
                        <Pencil className="size-4" />
                        Editar
                      </Button>
                    }
                  />
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Editar ministerio</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={editForm.handleSubmit(handleEdit)} className="space-y-4 pt-2">
                      <Field>
                        <FieldLabel htmlFor="edit-name">Nombre *</FieldLabel>
                        <Input id="edit-name" {...editForm.register("name")} />
                        <FieldError errors={[editForm.formState.errors.name]} />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="edit-description">Descripción</FieldLabel>
                        <Input id="edit-description" {...editForm.register("description")} />
                        <FieldError errors={[editForm.formState.errors.description]} />
                      </Field>
                      <Field>
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            {...editForm.register("is_active")}
                            className="size-4"
                          />
                          Ministerio activo
                        </label>
                      </Field>
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={editForm.formState.isSubmitting}
                      >
                        {editForm.formState.isSubmitting ? "Guardando..." : "Guardar cambios"}
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
                <Button render={<Link href="/movements/new" />} nativeButton={false}>
                  <ArrowLeftRight className="size-4" />
                  Transferir fondos
                </Button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-[18px] bg-card border border-border px-5 py-[18px] flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-faint">
              Fondos transferidos
            </span>
            <div className="flex size-[26px] items-center justify-center rounded-[8px] bg-primary-soft">
              <ArrowLeftRight className="size-3.5 text-primary" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-extrabold tabular-nums">{formatCLP(totalTransferred)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Total histórico · {leftover.length} transferencia{leftover.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        <div className="rounded-[18px] bg-card border border-border px-5 py-[18px] flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-faint">
              Rendido
            </span>
            <div className="flex size-[26px] items-center justify-center rounded-[8px] bg-income-surface">
              <BadgeCheck className="size-3.5 text-income" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-extrabold tabular-nums">{formatCLP(totalSettled)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {settledPct}% de los fondos entregados
            </p>
          </div>
        </div>
        <div className="rounded-[18px] bg-card border border-border px-5 py-[18px] flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-faint">
              Solicitudes
            </span>
            <div className="flex size-[26px] items-center justify-center rounded-[8px] bg-warn-surface">
              <ClipboardList className="size-3.5 text-on-warn" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-extrabold tabular-nums">{intentions.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {pendingCount} pendiente{pendingCount === 1 ? "" : "s"} · {approvedCount} aprobada
              {approvedCount === 1 ? "" : "s"} · {rejectedCount} rechazada
              {rejectedCount === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        <div className="rounded-[18px] bg-card border border-border px-5 py-[18px] flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-faint">
              Remanente a devolver
            </span>
            <div className="flex size-[26px] items-center justify-center rounded-[8px] bg-warn-surface">
              <HandCoins className="size-3.5 text-on-warn" />
            </div>
          </div>
          <div>
            <p
              className={`text-2xl font-extrabold tabular-nums ${totalLeftover > 0 ? "text-warn" : totalLeftover < 0 ? "text-destructive" : ""}`}
            >
              {formatCLP(totalLeftover)}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Al final del período</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-4 items-start">
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl bg-card border border-border p-5 flex flex-col gap-4">
            <h2 className="text-[13px] font-bold text-foreground">Ministro asignado</h2>
            {current?.users ? (
              <div className="flex items-center gap-3">
                <div
                  className="flex size-10 shrink-0 items-center justify-center rounded-full text-xs font-extrabold text-white"
                  style={{ background: avatarColorFor(current.users.full_name) }}
                >
                  {initialsFor(current.users.full_name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold truncate">{current.users.full_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{current.users.email}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <UserRound className="size-4" />
                Sin ministro asignado
              </div>
            )}

            {canManage && current && (
              <Button
                variant="destructive"
                onClick={() => setUnassignConfirmOpen(true)}
                className="w-fit"
              >
                <UserMinus className="size-4" />
                Desasignar
              </Button>
            )}

            {canManage &&
              (current ? (
                <>
                  <Button variant="outline" onClick={() => setChangeMinisterOpen(true)}>
                    Cambiar ministro
                  </Button>
                  {changeMinisterDialog}
                </>
              ) : (
                assignMinisterForm
              ))}
          </div>

          {canManageDelegates && (
            <div className="rounded-2xl bg-card border border-border p-5 flex flex-col gap-3.5">
              <div className="flex items-center justify-between">
                <h2 className="text-[13px] font-bold text-foreground">Delegados</h2>
                <Dialog
                  open={addDelegateOpen}
                  onOpenChange={(o) => {
                    setAddDelegateOpen(o)
                    if (!o) delegateForm.reset({ full_name: "", email: "" })
                  }}
                >
                  <DialogTrigger
                    render={
                      <button
                        type="button"
                        title="Agregar delegado"
                        className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-input bg-card text-foreground hover:bg-muted transition-colors"
                      >
                        <UserPlus className="size-3.5" />
                      </button>
                    }
                  />
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Agregar delegado</DialogTitle>
                      <DialogDescription>
                        Puede actuar en nombre del ministerio con las mismas facultades que el
                        ministro.
                      </DialogDescription>
                    </DialogHeader>
                    <form
                      onSubmit={delegateForm.handleSubmit(handleInviteDelegate)}
                      className="space-y-4 pt-2"
                    >
                      <Field>
                        <FieldLabel htmlFor="delegate-name">Nombre *</FieldLabel>
                        <Input id="delegate-name" {...delegateForm.register("full_name")} />
                        <FieldError errors={[delegateForm.formState.errors.full_name]} />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="delegate-email">Correo electrónico *</FieldLabel>
                        <Input
                          id="delegate-email"
                          type="email"
                          {...delegateForm.register("email")}
                        />
                        <FieldError errors={[delegateForm.formState.errors.email]} />
                      </Field>
                      <Button
                        type="submit"
                        className="w-full"
                        disabled={delegateForm.formState.isSubmitting}
                      >
                        {delegateForm.formState.isSubmitting ? "Enviando..." : "Enviar invitación"}
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
              <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                Pueden actuar en nombre del ministerio. El ministro asignado también puede gestionar
                sus propios delegados.
              </p>
              {delegates.length === 0 ? (
                <p className="text-[12.5px] text-faint py-1">Sin delegados asignados.</p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {delegates.map((d) => (
                    <div key={d.id} className="flex items-center gap-2.5">
                      <div
                        className="flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold text-white"
                        style={{ background: avatarColorFor(d.users?.full_name ?? d.user_id) }}
                      >
                        {initialsFor(d.users?.full_name ?? "?")}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12.5px] font-bold truncate">
                          {d.users?.full_name ?? "—"}
                        </p>
                        <p className="text-[11px] text-faint truncate">{d.users?.email ?? "—"}</p>
                      </div>
                      <button
                        type="button"
                        title="Quitar delegado"
                        onClick={() => handleRemoveDelegate(d.id)}
                        className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-expense-surface hover:border-expense hover:text-expense transition-colors"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="rounded-2xl bg-card border border-border p-5 flex flex-col gap-4">
            <h2 className="text-[13px] font-bold text-foreground">Historial de asignaciones</h2>
            {assignments.length === 0 ? (
              <Empty className="border-dashed">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <UserRound />
                  </EmptyMedia>
                  <EmptyTitle>Sin asignaciones</EmptyTitle>
                  <EmptyDescription>Aún no hay asignaciones registradas.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="flex flex-col gap-3">
                {assignments.map((a) => (
                  <div key={a.id} className="flex items-center gap-2.5">
                    <div
                      className="flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold text-white"
                      style={{ background: avatarColorFor(a.users?.full_name ?? a.user_id) }}
                    >
                      {initialsFor(a.users?.full_name ?? "?")}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] font-bold truncate">
                        {a.users?.full_name ?? "—"}
                      </p>
                      <p className="text-[11.5px] text-faint">
                        {a.unassigned_at
                          ? `${formatDate(a.assigned_at)} — ${formatDate(a.unassigned_at)}`
                          : `Desde ${formatDate(a.assigned_at)}`}
                      </p>
                    </div>
                    {!a.unassigned_at && (
                      <Badge variant="income" className="shrink-0">
                        Activo
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-card border border-border p-5 flex flex-col gap-4">
            <h2 className="text-[13px] font-bold text-foreground">Información</h2>
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                  Creado
                </p>
                <p className="text-sm font-semibold">{formatDate(ministry.created_at)}</p>
              </div>
              <div>
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                  Creado por
                </p>
                <p className="text-sm font-semibold">
                  {ministry.created_by_user?.full_name ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                  Última solicitud
                </p>
                <p className="text-sm font-semibold">
                  {intentions[0] ? formatDate(intentions[0].created_at) : "—"}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-2xl bg-card border border-border overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-sm font-bold text-foreground">Solicitudes del ministerio</h2>
              <Link href="/requests" className="text-xs font-bold text-primary hover:underline">
                Ver todas →
              </Link>
            </div>
            {intentions.length === 0 ? (
              <Empty className="border-dashed">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ClipboardList />
                  </EmptyMedia>
                  <EmptyTitle>Sin solicitudes</EmptyTitle>
                  <EmptyDescription>Este ministerio aún no registra solicitudes.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="flex flex-col">
                {intentions.slice(0, 4).map((intention) => {
                  const badge = INTENTION_STATUS_BADGE[intention.status]
                  return (
                    <Link
                      key={intention.id}
                      href={`/requests/${intention.id}`}
                      className="flex items-center gap-3 px-5 py-3.5 border-t border-border first:border-t-0 hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex size-[34px] shrink-0 items-center justify-center rounded-[10px] bg-muted border border-border">
                        <ClipboardList className="size-4 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold truncate">{intention.purpose}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          Solicitada el {formatDate(intention.created_at)} por{" "}
                          {intention.users?.full_name ?? "—"}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-sm font-extrabold tabular-nums">
                          {formatCLP(intention.amount)}
                        </span>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-card border border-border overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-sm font-bold text-foreground">Movimientos asociados</h2>
            </div>
            {associatedMovements.length === 0 ? (
              <Empty className="border-dashed">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <ArrowLeftRight />
                  </EmptyMedia>
                  <EmptyTitle>Sin movimientos</EmptyTitle>
                  <EmptyDescription>
                    Aún no hay movimientos asociados a este ministerio.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="flex flex-col">
                {associatedMovements.map((movement) => (
                  <Link
                    key={movement.id}
                    href={`/movements/${movement.id}`}
                    className="flex items-center gap-3 px-5 py-3.5 border-t border-border first:border-t-0 hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex size-[34px] shrink-0 items-center justify-center rounded-[10px] bg-expense-surface">
                      <TrendingDown className="size-4 text-expense" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold truncate">
                        {movement.movement_categories?.name ?? "—"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {formatDate(movement.movement_date)} · Registrado por{" "}
                        {movement.created_by?.full_name ?? "—"}
                      </p>
                    </div>
                    <span className="text-sm font-extrabold tabular-nums text-expense shrink-0">
                      -{formatCLP(Number(movement.amount))}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <Separator />

      <div className="rounded-2xl bg-card border border-border overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-1 px-5 py-4 border-b border-border">
          <h2 className="text-sm font-bold text-foreground">Remanente por solicitud</h2>
          <p className="text-xs text-muted-foreground">
            Transferido menos rendido (aprobado), a la fecha
          </p>
        </div>

        {leftover.length === 0 ? (
          <Empty className="border-none">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HandCoins />
              </EmptyMedia>
              <EmptyTitle>Sin remanentes</EmptyTitle>
              <EmptyDescription>
                Sin solicitudes con transferencia anticipada aún sin rendir.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground uppercase tracking-wide">
                <tr>
                  <th className="px-5 py-2.5 text-left font-medium">Solicitud</th>
                  <th className="px-5 py-2.5 text-right font-medium">Transferido</th>
                  <th className="px-5 py-2.5 text-right font-medium">Rendido</th>
                  <th className="px-5 py-2.5 text-right font-medium">Remanente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {leftover.map((row) => (
                  <tr key={row.intention_id}>
                    <td className="px-5 py-3">{row.purpose}</td>
                    <td className="px-5 py-3 text-right">{formatCLP(row.transferred_amount)}</td>
                    <td className="px-5 py-3 text-right">{formatCLP(row.settled_amount)}</td>
                    <td
                      className={`px-5 py-3 text-right font-medium ${row.leftover > 0 ? "text-warn" : row.leftover < 0 ? "text-destructive" : ""}`}
                    >
                      {formatCLP(row.leftover)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex justify-between items-center px-5 py-3.5 border-t border-border bg-muted/40 text-sm">
              <span className="font-extrabold">Total</span>
              <span className="font-extrabold">
                {formatCLP(leftover.reduce((sum, row) => sum + row.leftover, 0))}
              </span>
            </div>
          </>
        )}
      </div>

      <Dialog
        open={unassignConfirmOpen}
        onOpenChange={(o) => !unassigning && setUnassignConfirmOpen(o)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desasignar ministro</DialogTitle>
            <DialogDescription>
              ¿Desasignar a <strong>{current?.users?.full_name}</strong> de este ministerio?
            </DialogDescription>
          </DialogHeader>
          {unassigning && (
            <Marker role="status" aria-live="polite">
              <MarkerIcon>
                <Spinner />
              </MarkerIcon>
              <MarkerContent>Desasignando…</MarkerContent>
            </Marker>
          )}
          <div className="flex flex-col gap-2 pt-2 border-t border-border">
            <Button
              variant="destructive"
              disabled={unassigning}
              onClick={() => void handleUnassign()}
            >
              Sí, desasignar
            </Button>
            <Button
              variant="outline"
              disabled={unassigning}
              onClick={() => setUnassignConfirmOpen(false)}
            >
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
