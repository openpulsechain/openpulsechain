import {
  ResponsiveContainer,
  AreaChart as RechartsArea,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { formatUsd, formatDateShort } from '../../lib/format'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface AreaChartProps {
  data: any[]
  xKey: string
  yKey: string
  color?: string
  yFormatter?: (v: number) => string
}

export function AreaChartComponent({ data, xKey, yKey, color = '#34d399', yFormatter }: AreaChartProps) {
  const fmt = yFormatter || formatUsd

  return (
    <ResponsiveContainer width="100%" height={300}>
      <RechartsArea data={data}>
        <defs>
          <linearGradient id={`grad-${yKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
        <XAxis
          dataKey={xKey}
          tickFormatter={formatDateShort}
          stroke="#6b7280"
          tick={{ fontSize: 12 }}
          interval="preserveStartEnd"
        />
        <YAxis
          tickFormatter={(v) => fmt(v)}
          stroke="#6b7280"
          tick={{ fontSize: 12 }}
          width={70}
        />
        <Tooltip
          contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
          labelFormatter={(label) => formatDateShort(String(label))}
          formatter={(v: unknown) => [fmt(Number(v)), '']}
        />
        <Area
          type="monotone"
          dataKey={yKey}
          stroke={color}
          fill={`url(#grad-${yKey})`}
          strokeWidth={2}
        />
      </RechartsArea>
    </ResponsiveContainer>
  )
}
