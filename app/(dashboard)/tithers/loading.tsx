import { Skeleton } from "@/components/ui/skeleton"

export default function TithersLoading() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-28 rounded-[18px]" />
      <Skeleton className="h-96 rounded-xl" />
    </div>
  )
}
