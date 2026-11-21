"use client"

import { Controller, useWatch } from "react-hook-form"
import { format } from "date-fns"
import { FileText, ImageIcon, X, Lock } from "lucide-react"
import { Input } from "@/components/ui/input"
import { CurrencyInput } from "@/components/ui/currency-input"
import { Button } from "@/components/ui/button"
import { DatePicker } from "@/components/ui/date-picker"
import { NativeSelect } from "@/components/ui/native-select"
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field"
import { DeliveredByAutocomplete } from "@/components/movements/delivered-by-autocomplete"
import { AttachmentInput } from "@/components/ui/attachment-input"
import { MAX_ATTACHMENTS_PER_ENTITY } from "@/lib/constants/attachments"
import { attachmentHref } from "@/lib/storage/attachments"
import type { MovementFormState } from "@/hooks/use-movement-form"

const labelClass = "text-[11px] font-bold uppercase tracking-wider text-muted-foreground ml-1"

export function MovementStep1Fields({ state }: { state: MovementFormState }) {
  const { form, isCapitalInjection } = state

  const amountField = (
    <Field key="amount" data-invalid={!!form.formState.errors.amount || undefined}>
      <FieldLabel className={labelClass}>Monto (CLP)</FieldLabel>
      <Controller
        name="amount"
        control={form.control}
        render={({ field }) => (
          <CurrencyInput
            className="h-12 sm:h-14 text-lg font-bold"
            placeholder="0"
            aria-invalid={!!form.formState.errors.amount}
            value={field.value as number | string | undefined}
            onChange={field.onChange}
            onBlur={field.onBlur}
          />
        )}
      />
      <FieldError errors={[form.formState.errors.amount]} />
    </Field>
  )

  const dateField = (
    <Field key="date" data-invalid={!!form.formState.errors.movement_date || undefined}>
      <FieldLabel className={labelClass}>Fecha de Registro</FieldLabel>
      <Controller
        name="movement_date"
        control={form.control}
        render={({ field }) => (
          <DatePicker
            value={field.value ? new Date(`${field.value}T12:00:00Z`) : undefined}
            onChange={(date) => field.onChange(date ? format(date, "yyyy-MM-dd") : "")}
            className="h-12 sm:h-14"
          />
        )}
      />
      <FieldError errors={[form.formState.errors.movement_date]} />
    </Field>
  )

  return (
    <div className="grid gap-6 sm:gap-8 grid-cols-1 sm:grid-cols-2">
      {!isCapitalInjection && (
        <Field>
          <FieldLabel className={labelClass}>Tipo de Operación</FieldLabel>
          <NativeSelect className="w-full" size="lg" {...form.register("movement_type")}>
            <option value="INCOME">Ingreso (Entrada)</option>
            <option value="EXPENSE">Egreso (Gasto)</option>
          </NativeSelect>
        </Field>
      )}

      {isCapitalInjection ? (
        <>
          {dateField}
          {amountField}
        </>
      ) : (
        <>
          {amountField}
          {dateField}
        </>
      )}
    </div>
  )
}

export function MovementStep2Fields({ state }: { state: MovementFormState }) {
  const { form, isCapitalInjection, deliveredByLabel, paymentMethodOptions, categoryOptions, subcategoryOptions } =
    state
  const currentCategoryId = useWatch({ control: form.control, name: "category_id" })
  const movementType = useWatch({ control: form.control, name: "movement_type" })
  const lockedCategoryName = categoryOptions.find((c) => c.id === currentCategoryId)?.name

  return (
    <div className="grid gap-6 sm:gap-8 grid-cols-1 sm:grid-cols-2">
      {!isCapitalInjection && (
        <Field>
          <FieldLabel htmlFor="delivered_by" className={labelClass}>
            {deliveredByLabel}
          </FieldLabel>
          <Controller
            control={form.control}
            name="delivered_by"
            render={({ field }) => (
              <DeliveredByAutocomplete
                id="delivered_by"
                className="h-12 sm:h-14"
                value={field.value ?? ""}
                onChange={field.onChange}
                onBlur={field.onBlur}
                movementType={movementType === "EXPENSE" ? "EXPENSE" : "INCOME"}
              />
            )}
          />
        </Field>
      )}

      {!isCapitalInjection && (
        <Field data-invalid={!!form.formState.errors.receipt_email || undefined}>
          <FieldLabel className={labelClass}>Email de comprobante</FieldLabel>
          <Input
            type="email"
            className="h-12 sm:h-14"
            placeholder="correo@ejemplo.com"
            aria-invalid={!!form.formState.errors.receipt_email}
            {...form.register("receipt_email")}
          />
          <FieldError errors={[form.formState.errors.receipt_email]} />
        </Field>
      )}

      <Field>
        <FieldLabel className={labelClass}>Medio de Pago</FieldLabel>
        <NativeSelect
          className="w-full"
          size="lg"
          {...form.register("payment_method_id", {
            setValueAs: (value: string) => (value === "" ? undefined : value)
          })}
        >
          <option value="">Sin especificar</option>
          {paymentMethodOptions.map((pm) => (
            <option key={pm.id} value={pm.id}>
              {pm.name}
            </option>
          ))}
        </NativeSelect>
      </Field>

      <Field data-invalid={!!form.formState.errors.category_id || undefined}>
        <FieldLabel className={labelClass}>Categoría</FieldLabel>
        {isCapitalInjection ? (
          <>
            <input type="hidden" {...form.register("category_id")} />
            <div className="flex h-12 sm:h-14 items-center gap-2 rounded-lg border border-border bg-muted px-5 text-base font-medium text-muted-foreground">
              <Lock className="size-4" />
              {lockedCategoryName ?? "Aporte de Capital"}
            </div>
          </>
        ) : (
          <NativeSelect
            className="w-full"
            size="lg"
            aria-invalid={!!form.formState.errors.category_id}
            {...form.register("category_id")}
          >
            <option value="">Seleccione Categoría</option>
            {categoryOptions.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </NativeSelect>
        )}
        <FieldError errors={[form.formState.errors.category_id]} />
      </Field>

      {!isCapitalInjection && subcategoryOptions.length > 0 && (
        <Field>
          <FieldLabel className={labelClass}>Subcategoría</FieldLabel>
          <NativeSelect
            className="w-full"
            size="lg"
            {...form.register("subcategory_id", {
              setValueAs: (value: string) => (value === "" ? undefined : value)
            })}
          >
            <option value="">Sin subcategoría</option>
            {subcategoryOptions.map((subcategory) => (
              <option key={subcategory.id} value={subcategory.id}>
                {subcategory.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}
    </div>
  )
}

export function MovementStep3Fields({ state }: { state: MovementFormState }) {
  const { form, existingAttachments, handleRemoveExisting, attachmentUpload, attachmentsAtCap } = state

  return (
    <FieldGroup>
      <Field>
        <FieldLabel className={labelClass}>Comentarios / Observaciones</FieldLabel>
        <textarea
          className="flex min-h-[100px] sm:min-h-[120px] w-full rounded-lg border border-border bg-background px-4 py-3 text-base font-medium text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
          placeholder="Algún detalle adicional relevante..."
          {...form.register("notes")}
        />
      </Field>

      <Field>
        <label className="flex items-start gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            className="mt-0.5 size-4"
            {...form.register("notify_by_email")}
          />
          <span>
            Notificar por correo a tesorería
            <span className="block text-xs font-normal text-muted-foreground">
              Se avisa por correo que este movimiento fue registrado. El movimiento queda
              igual en el sistema aunque no lo marques.
            </span>
          </span>
        </label>
      </Field>

      {existingAttachments.length > 0 && (
        <Field>
          <FieldLabel className={labelClass}>Adjuntos existentes</FieldLabel>
          <div className="flex flex-col gap-2">
            {existingAttachments.map((att) => (
              <div key={att.id} className="flex items-center gap-3 rounded-xl bg-muted px-4 py-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
                  {att.mime_type.startsWith("image/") ? (
                    <ImageIcon className="size-4 text-muted-foreground" />
                  ) : (
                    <FileText className="size-4 text-muted-foreground" />
                  )}
                </div>
                <a
                  href={attachmentHref("attachments", att.storage_path) ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 truncate text-xs font-bold text-primary hover:underline"
                >
                  {att.file_name}
                </a>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  onClick={() => handleRemoveExisting(att.id)}
                  aria-label={`Eliminar ${att.file_name}`}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        </Field>
      )}

      <Field>
        <FieldLabel className={labelClass}>Comprobantes (foto o archivo)</FieldLabel>
        <AttachmentInput
          items={attachmentUpload.items}
          isUploading={attachmentUpload.isUploading}
          disabled={attachmentsAtCap}
          maxReachedMessage={`Alcanzaste el máximo de ${MAX_ATTACHMENTS_PER_ENTITY} adjuntos para este movimiento`}
          onAddFiles={attachmentUpload.addFiles}
          onRemove={attachmentUpload.remove}
        />
        {attachmentUpload.error && (
          <p className="text-sm font-normal text-destructive">{attachmentUpload.error}</p>
        )}
      </Field>
    </FieldGroup>
  )
}
