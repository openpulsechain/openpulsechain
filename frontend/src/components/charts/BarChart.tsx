import {
  ResponsiveContainer,
  BarChart as RechartsBar,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts'
import { formatUsd, formatDateShort } from '../../lib/format'

interface BarChartProps {
  data: any[]
  xKey: string
  bars: { key: string; color: string; name: string }[]
}

export function BarChartComponent({ data, xKey, bars }: BarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <RechartsBar data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis
          dataKey={xKey}
          tickFormatter={formatDateShort}
          stroke="#6b7280"
          tick={{ fontSize: 12 }}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={(v) => formatUsd(v)}
          stroke="#6b7280"
          tick={{ fontSize: 12 }}
          width={70}
        />
        <Tooltip
          contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
          labelFormatter={(label) => formatDateShort(String(label))}
          formatter={(v: unknown) => [formatUsd(Number(v)), '']}
        />
        <Legend />
        {bars.map((bar) => (
          <Bar key={bar.key} dataKey={bar.key} fill={bar.color} name={bar.name} radius={[2, 2, 0, 0]} />
        ))}
      </RechartsBar>
    </ResponsiveContainer>
  )
}
