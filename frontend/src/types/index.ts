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
  address: string | null
  source: string | null
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

export interface PulsexTopPair {
  pair_address: string
  token0_symbol: string
  token0_name: string
  token1_symbol: string
  token1_name: string
  volume_usd: number
  reserve_usd: number
  total_transactions: number
}

export interface HyperlaneTransfer {
  id: number
  msg_id: string | null
  direction: 'inbound' | 'outbound'
  is_delivered: boolean
  origin_chain_id: number
  origin_chain_name: string | null
  destination_chain_id: number
  destination_chain_name: string | null
  sender_address: string | null
  recipient_address: string | null
  origin_tx_sender: string | null
  origin_tx_hash: string | null
  destination_tx_hash: string | null
  token_symbol: string | null
  token_decimals: number | null
  amount_raw: string | null
  amount_usd: number | null
  send_occurred_at: string
  delivery_occurred_at: string | null
  nonce: number
}

export interface HyperlaneDailyStats {
  date: string
  inbound_count: number
  outbound_count: number
  inbound_volume_usd: number
  outbound_volume_usd: number
  net_flow_usd: number
  unique_users: number
  unique_chains: number
}

export interface BridgeTvlToken {
  token_symbol: string
  net_amount: number
  price_usd: number
  tvl_usd: number
}

export interface HyperlaneChainStats {
  chain_id: number
  chain_name: string | null
  total_inbound_count: number
  total_outbound_count: number
  total_inbound_volume_usd: number
  total_outbound_volume_usd: number
  net_flow_usd: number
  last_transfer_at: string | null
}
