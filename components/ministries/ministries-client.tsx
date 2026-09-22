"use client"

import { useState } from "react"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Plus, Users, ChevronRight, UserPlus, UserRound } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog"
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from "@/components/ui/empty"
import {
  Item,
  ItemGroup,
  ItemMedia,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions
} from "@/components/ui/item"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Field, FieldLabel, FieldError } from "@/components/ui/field"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { avatarColorFor, initialsFor } from "@/lib/utils"
import { createMinistrySchema, type CreateMinistryInput } from "@/lib/validators/ministry"
import { createMinistry, assignMinister } from "@/app/actions/ministries"
import { MinistryBudgetAdmin } from "@/components/ministries/ministry-budget-admin"
import type { MinistryBudgetSummaryRow } from "@/services/ministries/ministry-budget.service"

type Ministry = {
  id: string
  name: string
  description: string | null
  is_active: boolean
  created_at: string
}

type CurrentAssignment = {
  ministry_id: string
  users: { full_name: string } | null
}

type MinistryUser = {
  id: string
  full_name: string
  email: string
}

type BudgetPeriod = { id: string; label: string; start_date: string; end_date: string }

type Props = {
  initialMinistries: Ministry[]
  initialCurrentAssignments: CurrentAssignment[]
  ministers: MinistryUser[]
  canManageBudgets: boolean
  currentBudgetPeriod: BudgetPeriod | null
  budgetSummary: MinistryBudgetSummaryRow[]
}

export function MinistriesClient({
  initialMinistries,
  initialCurrentAssignments,
  ministers,
  canManageBudgets,
  currentBudgetPeriod,
  budgetSummary
}: Props) {
  const [ministries, setMinistries] = useState<Ministry[]>(initialMinistries)
  const [currentAssignments, setCurrentAssignments] =
    useState<CurrentAssignment[]>(initialCurrentAssignments)
  const [open, setOpen] = useState(false)
  const [ministerId, setMinisterId] = useState("")

  const form = useForm<CreateMinistryInput>({
    resolver: zodResolver(createMinistrySchema),
    defaultValues: { name: "", description: "" }
  })

  function getMinister(ministryId: string) {
    return currentAssignments.find((a) => a.ministry_id === ministryId)?.users ?? null
  }

  async function handleCreate(values: CreateMinistryInput) {
    try {
      const created = await createMinistry({
        name: values.name.trim(),
        description: values.description?.trim() || undefined
      })
      const newMinistry = created as unknown as Ministry

      if (ministerId) {
        const minister = ministers.find((m) => m.id === ministerId)
        await assignMinister(newMinistry.id, { user_id: ministerId })
        if (minister) {
          setCurrentAssignments((prev) => [
            ...prev,
            { ministry_id: newMinistry.id, users: { full_name: minister.full_name } }
          ])
        }
      }

      setMinistries((prev) => [newMinistry, ...prev])
      form.reset()
      setMinisterId("")
      setOpen(false)
      toast.success("Ministerio creado")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al crear ministerio")
    }
  }

  const ministriesList =
    ministries.length === 0 ? (
      <Empty>
        <EmptyMedia>
          <Users className="size-10 text-muted-foreground" />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>Sin ministerios</EmptyTitle>
          <EmptyDescription>Crea el primer ministerio para comenzar.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    ) : (
      <ItemGroup>
        {ministries.map((m) => {
          const ministerName = getMinister(m.id)?.full_name ?? null
          return (
            <Item
              key={m.id}
              variant="outline"
              render={<Link href={`/ministries/${m.id}`} />}
              className="rounded-2xl px-5 py-5 gap-4"
            >
              <ItemMedia>
                <div
                  className="flex size-[42px] items-center justify-center rounded-[13px] text-[13px] font-extrabold text-white"
                  style={{ background: avatarColorFor(m.name) }}
                >
                  {initialsFor(m.name)}
                </div>
              </ItemMedia>
              <ItemContent>
                <div className="flex items-center gap-2">
                  <ItemTitle className="text-[15px] font-bold">{m.name}</ItemTitle>
                  {!m.is_active && (
                    <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      Inactivo
                    </span>
                  )}
                </div>
                {m.description && <ItemDescription>{m.description}</ItemDescription>}
              </ItemContent>
              <ItemActions>
                {ministerName ? (
                  <span className="inline-flex items-center gap-1.5 text-[11.5px] bg-primary-soft text-primary px-[11px] py-1 rounded-full font-bold">
                    <UserRound className="size-3" />
                    {ministerName}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Sin ministro</span>
                )}
                <ChevronRight className="size-4 text-muted-foreground" />
              </ItemActions>
            </Item>
          )
        })}
      </ItemGroup>
    )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-extrabold tracking-tight text-foreground mb-1">
            Ministerios
          </h1>
          <p className="text-[13.5px] text-muted-foreground">
            Gestiona los ministerios y sus ministros asignados
          </p>
        </div>
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o)
            if (!o) {
              form.reset()
              setMinisterId("")
            }
          }}
        >
          <DialogTrigger
            render={
              <Button>
                <Plus className="size-4" />
                Nuevo ministerio
              </Button>
            }
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nuevo ministerio</DialogTitle>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(handleCreate)} className="space-y-4 pt-2">
              <Field>
                <FieldLabel htmlFor="name">Nombre *</FieldLabel>
                <Input id="name" placeholder="Ministerio de Jóvenes" {...form.register("name")} />
                <FieldError errors={[form.formState.errors.name]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="description">Descripción</FieldLabel>
                <Input
                  id="description"
                  placeholder="Descripción opcional"
                  {...form.register("description")}
                />
                <FieldError errors={[form.formState.errors.description]} />
              </Field>
              <Field>
                <div className="flex items-center justify-between">
                  <FieldLabel htmlFor="minister">Ministro</FieldLabel>
                  <Link
                    href="/users?invite=MINISTER"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    <UserPlus className="size-3.5" />
                    Crear cuenta de ministro
                  </Link>
                </div>
                <NativeSelect
                  id="minister"
                  className="w-full"
                  value={ministerId}
                  onChange={(e) => setMinisterId(e.target.value)}
                >
                  <NativeSelectOption value="">Sin ministro</NativeSelectOption>
                  {ministers.map((m) => (
                    <NativeSelectOption key={m.id} value={m.id}>
                      {m.full_name} — {m.email}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? "Creando..." : "Crear ministerio"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {canManageBudgets ? (
        <Tabs defaultValue="ministerios">
          <TabsList>
            <TabsTrigger value="ministerios">Ministerios</TabsTrigger>
            <TabsTrigger value="presupuesto">Presupuesto</TabsTrigger>
          </TabsList>
          <TabsContent value="ministerios" className="pt-4">
            {ministriesList}
          </TabsContent>
          <TabsContent value="presupuesto" className="pt-4">
            <MinistryBudgetAdmin
              ministries={ministries}
              currentPeriod={currentBudgetPeriod}
              summary={budgetSummary}
            />
          </TabsContent>
        </Tabs>
      ) : (
        ministriesList
      )}
    </div>
  )
}
