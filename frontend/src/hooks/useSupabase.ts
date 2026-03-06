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
  PulsexTopPair,
  HyperlaneTransfer,
  HyperlaneDailyStats,
  HyperlaneChainStats,
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
        const limit = options?.limit
        if (limit && limit <= 1000) {
          let query = supabase.from(table).select(options?.select || '*')
          if (options?.orderBy) {
            query = query.order(options.orderBy, { ascending: options.ascending ?? true })
          }
          query = query.limit(limit)
          const { data: rows, error: err } = await query
          if (err) throw err
          setData(rows as T[])
        } else {
          // Paginate to bypass Supabase 1000 row limit
          const pageSize = 1000
          let allRows: T[] = []
          let from = 0
          let hasMore = true
          while (hasMore) {
            let query = supabase.from(table).select(options?.select || '*')
            if (options?.orderBy) {
              query = query.order(options.orderBy, { ascending: options.ascending ?? true })
            }
            query = query.range(from, from + pageSize - 1)
            const { data: rows, error: err } = await query
            if (err) throw err
            allRows = allRows.concat(rows as T[])
            hasMore = (rows?.length ?? 0) === pageSize
            from += pageSize
          }
          setData(allRows)
        }
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

export function usePulsexTopPairs() {
  return useQuery<PulsexTopPair>('pulsex_top_pairs', {
    orderBy: 'volume_usd',
    ascending: false,
    limit: 30,
  })
}

export function useHyperlaneDailyStats() {
  return useQuery<HyperlaneDailyStats>('hyperlane_daily_stats', {
    orderBy: 'date',
    ascending: true,
  })
}

export function useHyperlaneChainStats() {
  return useQuery<HyperlaneChainStats>('hyperlane_chain_stats', {
    orderBy: 'total_inbound_volume_usd',
    ascending: false,
  })
}

export function useHyperlaneTransfers() {
  return useQuery<HyperlaneTransfer>('hyperlane_transfers', {
    orderBy: 'send_occurred_at',
    ascending: false,
    limit: 50,
    select: 'id,direction,is_delivered,origin_chain_id,origin_chain_name,destination_chain_id,destination_chain_name,origin_tx_sender,origin_tx_hash,destination_tx_hash,token_symbol,amount_raw,amount_usd,send_occurred_at',
  })
}

export function useHyperlaneWhales(minUsd = 10000) {
  const [data, setData] = useState<HyperlaneTransfer[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data: rows, error } = await supabase
          .from('hyperlane_transfers')
          .select('id,direction,is_delivered,origin_chain_id,origin_chain_name,destination_chain_id,destination_chain_name,origin_tx_sender,origin_tx_hash,destination_tx_hash,token_symbol,amount_raw,amount_usd,send_occurred_at')
          .gte('amount_usd', minUsd)
          .order('send_occurred_at', { ascending: false })
          .limit(20)
        if (error) throw error
        setData(rows as HyperlaneTransfer[])
      } catch {
        setData([])
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [minUsd])

  return { data, loading }
}

export function useBridgeWhales(minUsd = 50000) {
  const [data, setData] = useState<BridgeTransfer[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data: rows, error } = await supabase
          .from('bridge_transfers')
          .select('id,direction,status,user_address,token_symbol,token_decimals,amount_raw,amount_usd,tx_hash_eth,tx_hash_pls,block_timestamp,chain_source')
          .gte('amount_usd', minUsd)
          .order('block_timestamp', { ascending: false })
          .limit(30)
        if (error) throw error
        setData(rows as BridgeTransfer[])
      } catch {
        setData([])
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [minUsd])

  return { data, loading }
}
