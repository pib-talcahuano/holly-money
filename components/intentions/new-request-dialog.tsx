"use client"

import { useState } from "react"
import { useForm, Controller, type Resolver } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Plus, Target, Calendar, Wallet, DollarSign, Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CurrencyInput } from "@/components/ui/currency-input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Field, FieldLabel, FieldError } from "@/components/ui/field"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { DatePicker } from "@/components/ui/date-picker"
import { createIntentionSchema } from "@/lib/validators/intention"
import type { CreateIntentionInput } from "@/lib/validators/intention"
import { MIN_REQUEST_AMOUNT, MAX_REQUEST_AMOUNT } from "@/lib/constants/requests"
import { createRequest } from "@/app/actions/requests"

type IntentionFormValues = Omit<CreateIntentionInput, "amount"> & { amount: string }

const DEFAULT_VALUES: IntentionFormValues = {
  amount: "",
  purpose: "",
  date_needed: "",
  funding_method: "REIMBURSEMENT",
  isDraft: false
}

export function NewRequestDialog({
  onCreated
}: {
  onCreated?: (created: Awaited<ReturnType<typeof createRequest>>) => void
}) {
  const [open, setOpen] = useState(false)

  const form = useForm<IntentionFormValues, unknown, CreateIntentionInput>({
    resolver: zodResolver(createIntentionSchema) as Resolver<
      IntentionFormValues,
      unknown,
      CreateIntentionInput
    >,
    defaultValues: DEFAULT_VALUES
  })

  async function handleSubmit(values: CreateIntentionInput) {
    try {
      const created = await createRequest({
        ...values,
        date_needed: values.date_needed || undefined
      })
      onCreated?.(created)
      setOpen(false)
      form.reset(DEFAULT_VALUES)
      toast.success(
        values.isDraft ? "Borrador guardado" : "Solicitud enviada al equipo de tesorería"
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al enviar solicitud")
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) form.reset(DEFAULT_VALUES)
      }}
    >
      <DialogTrigger
        render={
          <Button>
            <Plus className="size-4" />
            Nueva solicitud
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Solicitud de dinero</DialogTitle>
        </DialogHeader>
        <form className="space-y-4">
          <Alert variant="info">
            <AlertDescription>
              Pide fondos para un ministerio antes de gastar. Tesorería revisa y aprueba; luego
              rindes con comprobantes.
            </AlertDescription>
          </Alert>
          <Field>
            <FieldLabel htmlFor="int-purpose" className="flex items-center gap-1.5">
              <Target className="size-3.5" />
              Propósito *
            </FieldLabel>
            <Input
              id="int-purpose"
              placeholder="Ej: Materiales para campamento de jóvenes"
              {...form.register("purpose")}
            />
            <FieldError errors={[form.formState.errors.purpose]} />
          </Field>
          <Field>
            <FieldLabel className="flex items-center gap-1.5">
              <Calendar className="size-3.5" />
              Fecha en que se necesita
            </FieldLabel>
            <Controller
              control={form.control}
              name="date_needed"
              render={({ field }) => (
                <DatePicker
                  value={field.value ? new Date(field.value + "T00:00:00") : undefined}
                  onChange={(date) =>
                    field.onChange(
                      date
                        ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
                        : ""
                    )
                  }
                />
              )}
            />
            <FieldError errors={[form.formState.errors.date_needed]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="int-funding-method" className="flex items-center gap-1.5">
              <Wallet className="size-3.5" />
              Método de financiamiento *
            </FieldLabel>
            <NativeSelect
              id="int-funding-method"
              className="w-full"
              {...form.register("funding_method")}
            >
              <NativeSelectOption value="REIMBURSEMENT">
                Reembolso (gasto primero, rindo después)
              </NativeSelectOption>
              <NativeSelectOption value="TRANSFER">
                Transferencia anticipada (la iglesia transfiere primero)
              </NativeSelectOption>
            </NativeSelect>
            <FieldError errors={[form.formState.errors.funding_method]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="int-amount" className="flex items-center gap-1.5">
              <DollarSign className="size-3.5" />
              Monto solicitado (CLP) *
            </FieldLabel>
            <Controller
              control={form.control}
              name="amount"
              render={({ field }) => (
                <CurrencyInput
                  id="int-amount"
                  placeholder="100.000"
                  value={field.value}
                  onChange={(value) => field.onChange(value === undefined ? "" : String(value))}
                  onBlur={field.onBlur}
                />
              )}
            />
            <p className="text-xs text-muted-foreground">
              Entre ${MIN_REQUEST_AMOUNT.toLocaleString("es-CL")} y $
              {MAX_REQUEST_AMOUNT.toLocaleString("es-CL")}
            </p>
            <FieldError errors={[form.formState.errors.amount]} />
          </Field>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              disabled={form.formState.isSubmitting}
              onClick={form.handleSubmit((values) => handleSubmit({ ...values, isDraft: true }))}
            >
              Guardar borrador
            </Button>
            <Button
              type="button"
              className="flex-1"
              disabled={form.formState.isSubmitting}
              onClick={form.handleSubmit((values) => handleSubmit({ ...values, isDraft: false }))}
            >
              <Send className="size-3.5" />
              {form.formState.isSubmitting ? "Enviando..." : "Enviar solicitud"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
