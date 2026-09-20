"use client"

import { useState, forwardRef } from "react"
import { Eye, EyeOff } from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"

export const PasswordInput = forwardRef<HTMLInputElement, React.ComponentProps<typeof Input>>(
  ({ className, ...props }, ref) => {
    const [show, setShow] = useState(false)

    return (
      <InputGroup>
        <InputGroupInput
          ref={ref}
          type={show ? "text" : "password"}
          className={cn(className)}
          {...props}
        />
        <InputGroupAddon align="inline-end">
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none rounded"
            aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </InputGroupAddon>
      </InputGroup>
    )
  }
)

PasswordInput.displayName = "PasswordInput"
