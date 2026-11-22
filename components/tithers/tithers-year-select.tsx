"use client"

import { useRouter } from "next/navigation"

import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"

export function TithersYearSelect({ year, options }: { year: number; options: number[] }) {
  const router = useRouter()
  const years = options.includes(year) ? options : [...options, year]
  years.sort((a, b) => b - a)
  return (
    <NativeSelect
      aria-label="Año"
      value={year}
      onChange={(event) => router.push(`/tithers?year=${event.target.value}`)}
    >
      {years.map((option) => (
        <NativeSelectOption key={option} value={option}>
          {option}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  )
}
