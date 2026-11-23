import { Skeleton } from "@/components/ui/skeleton"

export default function PeopleLoading() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="h-10 w-48 rounded-xl" />
      <Skeleton className="h-96 rounded-xl" />
    </div>
  )
}
