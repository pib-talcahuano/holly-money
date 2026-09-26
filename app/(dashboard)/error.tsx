"use client"

import { useEffect } from "react"
import { TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from "@/components/ui/empty"

export default function DashboardError({
  error,
  reset
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <Empty className="border-0 py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <TriangleAlert />
        </EmptyMedia>
        <EmptyTitle>Ocurrió un error inesperado</EmptyTitle>
        <EmptyDescription>
          Algo falló al cargar esta sección. Puedes intentar de nuevo sin perder tu sesión.
        </EmptyDescription>
      </EmptyHeader>
      <Button onClick={() => reset()}>Reintentar</Button>
    </Empty>
  )
}
