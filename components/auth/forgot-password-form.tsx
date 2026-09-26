"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowLeft, ArrowRight, Loader2, MailCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field, FieldGroup, FieldLabel, FieldError } from "@/components/ui/field"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { RecoverySteps } from "@/components/auth/recovery-steps"
import { forgotPasswordSchema, type ForgotPasswordValues } from "@/lib/validators/auth"
import { sendForgotPassword } from "@/app/actions/auth"

const RESEND_COOLDOWN_SECONDS = 30

export function ForgotPasswordForm() {
  const [step, setStep] = useState<"email" | "sent">("email")
  const [sentEmail, setSentEmail] = useState("")
  const [cooldown, setCooldown] = useState(0)
  const [resending, setResending] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting }
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" }
  })

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [cooldown])

  const onSubmit = async (values: ForgotPasswordValues) => {
    await sendForgotPassword(values.email)
    setSentEmail(values.email)
    setStep("sent")
    setCooldown(RESEND_COOLDOWN_SECONDS)
  }

  const onResend = async () => {
    if (cooldown > 0 || resending) return
    setResending(true)
    await sendForgotPassword(sentEmail)
    setResending(false)
    setCooldown(RESEND_COOLDOWN_SECONDS)
  }

  if (step === "sent") {
    return (
      <div className="w-full">
        <RecoverySteps current={1} />

        <div className="flex size-[52px] items-center justify-center rounded-[14px] bg-primary-soft mb-[18px]">
          <MailCheck className="size-6 text-primary" />
        </div>

        <h1 className="font-heading text-[26px] font-extrabold tracking-tight text-foreground mb-1.5">
          Revisa tu correo
        </h1>
        <p className="text-[13.5px] leading-[1.55] text-muted-foreground mb-[22px]">
          Enviamos un enlace de recuperación a{" "}
          <strong className="text-foreground">{sentEmail}</strong>. El enlace vence en 2 días.
        </p>

        <Alert variant="info" className="mb-[22px]">
          <AlertDescription>
            Si no lo ves en unos minutos, revisa la carpeta de spam o solicita un nuevo enlace.
          </AlertDescription>
        </Alert>

        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={cooldown > 0 || resending}
          onClick={onResend}
        >
          {resending ? (
            <>
              <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
              Enviando...
            </>
          ) : cooldown > 0 ? (
            `Reenviar correo (${cooldown}s)`
          ) : (
            "Reenviar correo"
          )}
        </Button>

        <div className="mt-5 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-primary hover:underline"
          >
            <ArrowLeft className="size-[13px]" />
            Volver a iniciar sesión
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full">
      <RecoverySteps current={0} />

      <h1 className="font-heading text-[26px] font-extrabold tracking-tight text-foreground mb-1.5">
        Recupera tu acceso
      </h1>
      <p className="text-[13.5px] leading-[1.55] text-muted-foreground mb-7">
        Ingresa el correo asociado a tu cuenta y te enviaremos un enlace para restablecer tu
        contraseña.
      </p>

      <form className="flex flex-col gap-5" onSubmit={handleSubmit(onSubmit)}>
        <FieldGroup>
          <Field data-invalid={!!errors.email || undefined}>
            <FieldLabel
              htmlFor="email"
              className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-muted-foreground"
            >
              Correo electrónico
            </FieldLabel>
            <Input
              id="email"
              type="email"
              placeholder="correo@iglesia.cl"
              aria-invalid={!!errors.email}
              {...register("email")}
            />
            <FieldError errors={[errors.email]} />
          </Field>
        </FieldGroup>

        <Button type="submit" disabled={isSubmitting} className="w-full transition-colors">
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" data-icon="inline-start" />
              Enviando...
            </>
          ) : (
            <>
              Enviar enlace de recuperación
              <ArrowRight className="size-[15px]" data-icon="inline-end" />
            </>
          )}
        </Button>
      </form>

      <div className="mt-5 text-center">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-primary hover:underline"
        >
          <ArrowLeft className="size-[13px]" />
          Volver a iniciar sesión
        </Link>
      </div>
    </div>
  )
}
