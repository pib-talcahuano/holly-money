import { Skeleton } from "@/components/ui/skeleton"

// Mirrors the real page's blocks (app/(dashboard)/dashboard/page.tsx) so content
// replaces the skeleton in place instead of reflowing.
export default function DashboardLoading() {
  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-[22px]">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-36" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-9 w-64" />
      </div>

      <div className="flex flex-wrap gap-3.5 mb-3.5">
        <Skeleton className="flex-[2.4_1_460px] h-[124px] rounded-[18px]" />
        <Skeleton className="flex-[1_1_240px] h-[124px] rounded-[18px]" />
      </div>

      <Skeleton className="h-[244px] rounded-[14px] mb-3.5" />

      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-3.5 mb-3.5">
        <Skeleton className="h-[264px] rounded-[14px]" />
        <Skeleton className="h-[264px] rounded-[14px]" />
      </div>

      <Skeleton className="h-64 rounded-[14px]" />
    </div>
  )
}
