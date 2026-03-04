export function formatUsd(value: number | null | undefined): string {
  if (value == null) return '$0'
  if (Math.abs(value) >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`
  if (Math.abs(value) >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`
  if (Math.abs(value) >= 1_000) return `$${(value / 1_000).toFixed(1)}K`
  return `$${value.toFixed(2)}`
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null) return '0'
  return value.toLocaleString('en-US')
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function shortenAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

export function formatGwei(gwei: number): string {
  if (gwei >= 1_000_000) return `${(gwei / 1_000_000).toFixed(1)}M`
  if (gwei >= 1_000) return `${(gwei / 1_000).toFixed(1)}K`
  return gwei.toFixed(2)
}
