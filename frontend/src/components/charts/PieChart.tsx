import {
  ResponsiveContainer,
  PieChart as RechartsPie,
  Pie,
  Cell,
  Tooltip,
  Legend,
} from 'recharts'
import { formatUsd } from '../../lib/format'

const COLORS = ['#34d399', '#60a5fa', '#f97316', '#a78bfa', '#f472b6', '#fbbf24', '#6ee7b7', '#93c5fd']

interface PieChartProps {
  data: { name: string; value: number }[]
}

export function PieChartComponent({ data }: PieChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <RechartsPie>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          dataKey="value"
          nameKey="name"
          paddingAngle={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
          formatter={(v: unknown) => [formatUsd(Number(v)), '']}
        />
        <Legend />
      </RechartsPie>
    </ResponsiveContainer>
  )
}
