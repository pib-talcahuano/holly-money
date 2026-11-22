"use client"

import { useRouter } from "next/navigation"

import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"

export function TithersYearSelect({ year, options }: { year: number; options: number[] }) {
  const router = useRouter()
  return (
    <NativeSelect
      aria-label="Año"
      value={year}
      onChange={(event) => router.push(`/tithers?year=${event.target.value}`)}
    >
      {options.map((option) => (
        <NativeSelectOption key={option} value={option}>
          {option}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  )
}
