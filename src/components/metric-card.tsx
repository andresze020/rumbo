import type { ReactNode } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type MetricCardProps = {
  label: string
  value: ReactNode
  description: string
}

export function MetricCard({ label, value, description }: MetricCardProps) {
  return (
    <Card className="border-t-2 border-t-primary/50">
      <CardHeader>
        <CardTitle>{label}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  )
}
