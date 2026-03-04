-- Title:       PulseChain Bridge - Top Users (v3)
-- Description: Ranks bridge users by total USD volume (deposits + withdrawals).
--              Excludes bridge contracts themselves from ranking.
--              Partition-pruned on evt_block_date, sanitized prices ($50M cap/transfer).
-- Chain:       Ethereum mainnet
-- Contracts:   OmniBridge Proxy: 0x1715a3e4a142d8b698131108995174f37aeba10d
--              WETH Router:      0x8ac4ae65b3656e26dc4e0e69108b392283350f55
-- Output:      user_address, total_deposits_usd, total_withdrawals_usd,
--              net_flow_usd, deposit_count, withdrawal_count, first_bridge_date, last_bridge_date
-- Author:      pulsechain-analytics
-- Dune ID:     6775939
-- Performance: ~8 credits, ~15s execution

WITH bridge_contracts AS (
    SELECT address
    FROM (VALUES
        (0x1715a3e4a142d8b698131108995174f37aeba10d),
        (0x8ac4ae65b3656e26dc4e0e69108b392283350f55)
    ) AS t(address)
),

bridge_transfers AS (
    SELECT
        evt_block_time,
        evt_block_date AS day,
        contract_address AS token_address,
        CASE
            WHEN "to" IN (SELECT address FROM bridge_contracts) THEN 'deposit'
            WHEN "from" IN (SELECT address FROM bridge_contracts) THEN 'withdrawal'
        END AS direction,
        CASE
            WHEN "to" IN (SELECT address FROM bridge_contracts) THEN "from"
            WHEN "from" IN (SELECT address FROM bridge_contracts) THEN "to"
        END AS user_address,
        value AS raw_value
    FROM erc20_ethereum.evt_Transfer
    WHERE (
        "to" IN (SELECT address FROM bridge_contracts)
        OR "from" IN (SELECT address FROM bridge_contracts)
    )
    AND evt_block_date >= DATE '2023-05-10'
),

valued_transfers AS (
    SELECT
        bt.user_address,
        bt.direction,
        bt.evt_block_time,
        bt.raw_value / POWER(10, COALESCE(t.decimals, 18)) * COALESCE(p.price, 0) AS usd_value
    FROM bridge_transfers bt
    LEFT JOIN tokens.erc20 t
        ON t.contract_address = bt.token_address
        AND t.blockchain = 'ethereum'
    LEFT JOIN prices.day p
        ON p.contract_address = bt.token_address
        AND p.blockchain = 'ethereum'
        AND p.timestamp = CAST(bt.day AS TIMESTAMP)
    WHERE bt.direction IS NOT NULL
    AND bt.user_address NOT IN (SELECT address FROM bridge_contracts)
    AND bt.raw_value / POWER(10, COALESCE(t.decimals, 18)) * COALESCE(p.price, 0) <= 50000000
)

SELECT
    user_address,
    SUM(CASE WHEN direction = 'deposit' THEN usd_value ELSE 0 END) AS total_deposits_usd,
    SUM(CASE WHEN direction = 'withdrawal' THEN usd_value ELSE 0 END) AS total_withdrawals_usd,
    SUM(CASE WHEN direction = 'deposit' THEN usd_value ELSE 0 END)
        - SUM(CASE WHEN direction = 'withdrawal' THEN usd_value ELSE 0 END) AS net_flow_usd,
    SUM(CASE WHEN direction = 'deposit' THEN 1 ELSE 0 END) AS deposit_count,
    SUM(CASE WHEN direction = 'withdrawal' THEN 1 ELSE 0 END) AS withdrawal_count,
    MIN(evt_block_time) AS first_bridge_date,
    MAX(evt_block_time) AS last_bridge_date
FROM valued_transfers
GROUP BY user_address
ORDER BY total_deposits_usd + total_withdrawals_usd DESC
LIMIT 100
