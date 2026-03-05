export interface BridgeDailyStats {
  date: string
  deposit_count: number
  withdrawal_count: number
  deposit_volume_usd: number
  withdrawal_volume_usd: number
  net_flow_usd: number
  unique_users: number
}

export interface BridgeTokenStats {
  token_address: string
  token_symbol: string | null
  total_deposit_count: number
  total_withdrawal_count: number
  total_deposit_volume_usd: number
  total_withdrawal_volume_usd: number
  net_flow_usd: number
  last_bridge_at: string | null
}

export interface BridgeTransfer {
  id: string
  direction: 'deposit' | 'withdrawal'
  status: string
  user_address: string
  token_symbol: string | null
  token_decimals: number | null
  amount_raw: string
  amount_usd: number | null
  message_id: string | null
  tx_hash_eth: string | null
  tx_hash_pls: string | null
  block_timestamp: string
  chain_source: string
}

export interface NetworkTvl {
  date: string
  tvl_usd: number
}

export interface NetworkDexVolume {
  date: string
  volume_usd: number
}

export interface TokenPrice {
  id: string
  symbol: string
  name: string | null
  price_usd: number | null
  market_cap_usd: number | null
  volume_24h_usd: number | null
  price_change_24h_pct: number | null
  last_updated: string
}

export interface NetworkSnapshot {
  block_number: number
  gas_price_gwei: number
  base_fee_gwei: number
  timestamp: string
}

export interface PulsexDailyStats {
  date: string
  daily_volume_usd: number
  total_liquidity_usd: number
  total_volume_usd: number
  total_transactions: number
}
