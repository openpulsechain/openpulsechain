import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type {
  BridgeDailyStats,
  BridgeTokenStats,
  BridgeTransfer,
  NetworkTvl,
  NetworkDexVolume,
  TokenPrice,
  NetworkSnapshot,
  PulsexDailyStats,
} from '../types'

function useQuery<T>(table: string, options?: {
  orderBy?: string
  ascending?: boolean
  limit?: number
  select?: string
}) {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetch = async () => {
      try {
        let query = supabase.from(table).select(options?.select || '*')
        if (options?.orderBy) {
          query = query.order(options.orderBy, { ascending: options.ascending ?? true })
        }
        if (options?.limit) {
          query = query.limit(options.limit)
        }
        const { data: rows, error: err } = await query
        if (err) throw err
        setData(rows as T[])
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [table])

  return { data, loading, error }
}

export function useBridgeDailyStats() {
  return useQuery<BridgeDailyStats>('bridge_daily_stats', {
    orderBy: 'date',
    ascending: true,
  })
}

export function useBridgeTokenStats() {
  return useQuery<BridgeTokenStats>('bridge_token_stats', {
    orderBy: 'total_deposit_volume_usd',
    ascending: false,
    limit: 50,
  })
}

export function useBridgeTransfers() {
  return useQuery<BridgeTransfer>('bridge_transfers', {
    orderBy: 'block_timestamp',
    ascending: false,
    limit: 50,
    select: 'id,direction,status,user_address,token_symbol,token_decimals,amount_raw,amount_usd,tx_hash_eth,tx_hash_pls,block_timestamp,chain_source',
  })
}

export function useNetworkTvl() {
  return useQuery<NetworkTvl>('network_tvl_history', {
    orderBy: 'date',
    ascending: true,
  })
}

export function useNetworkDexVolume() {
  return useQuery<NetworkDexVolume>('network_dex_volume', {
    orderBy: 'date',
    ascending: true,
  })
}

export function useTokenPrices() {
  return useQuery<TokenPrice>('token_prices', {
    orderBy: 'market_cap_usd',
    ascending: false,
  })
}

export function useNetworkSnapshot() {
  return useQuery<NetworkSnapshot>('network_snapshots', {
    orderBy: 'timestamp',
    ascending: false,
    limit: 1,
  })
}

export function usePulsexDailyStats() {
  return useQuery<PulsexDailyStats>('pulsex_daily_stats', {
    orderBy: 'date',
    ascending: true,
  })
}
