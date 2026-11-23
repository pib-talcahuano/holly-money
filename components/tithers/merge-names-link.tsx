import Link from "next/link"
import { UsersIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

export function MergeNamesLink() {
  return (
    <Button
      variant="outline"
      render={<Link href="/people?type=INCOME" />}
      nativeButton={false}
      className="gap-2"
    >
      <UsersIcon data-icon="inline-start" />
      Unir nombres
    </Button>
  )
}
