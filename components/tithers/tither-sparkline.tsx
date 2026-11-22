import { sparklinePoints } from "@/lib/utils/tithers"

const WIDTH = 96
const HEIGHT = 24

export function TitherSparkline({
  values,
  unnamed = false
}: {
  values: number[]
  unnamed?: boolean
}) {
  return (
    <svg
      data-slot="tither-sparkline"
      aria-hidden="true"
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className={unnamed ? "text-faint" : "text-primary"}
    >
      <polyline
        points={sparklinePoints(values, WIDTH, HEIGHT)}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
