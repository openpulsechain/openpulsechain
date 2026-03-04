-- Title:       PulseChain Bridge - Token Breakdown
-- Description: Aggregate bridge volume by token with deposit/withdrawal split.
--              Shows which tokens are most actively bridged and net direction per token.
-- Chain:       Ethereum mainnet
-- Contracts:   OmniBridge Proxy: 0x1715a3e4a142d8b698131108995174f37aeba10d
--              WETH Router:      0x8ac4ae65b3656e26dc4e0e69108b392283350f55
-- Output:      token_symbol, token_address, total_deposits_usd, total_withdrawals_usd,
--              net_flow_usd, transaction_count
-- Author:      pulsechain-analytics
-- Dune Link:   (pending publication)

WITH bridge_contracts AS (
    SELECT address
    FROM (
        VALUES
            (0x1715a3e4a142d8b698131108995174f37aeba10d),
            (0x8ac4ae65b3656e26dc4e0e69108b392283350f55)
    ) AS t(address)
),

bridge_transfers AS (
    SELECT
        evt_block_time,
        contract_address AS token_address,
        CASE
            WHEN "to" IN (SELECT address FROM bridge_contracts) THEN 'deposit'
            WHEN "from" IN (SELECT address FROM bridge_contracts) THEN 'withdrawal'
        END AS direction,
        value AS raw_value
    FROM erc20_ethereum.evt_Transfer
    WHERE (
        "to" IN (SELECT address FROM bridge_contracts)
        OR "from" IN (SELECT address FROM bridge_contracts)
    )
    AND evt_block_time >= TIMESTAMP '2023-05-10'
),

valued_transfers AS (
    SELECT
        bt.token_address,
        bt.direction,
        bt.raw_value / POWER(10, COALESCE(t.decimals, 18)) AS token_amount,
        bt.raw_value / POWER(10, COALESCE(t.decimals, 18)) * COALESCE(p.price, 0) AS usd_value
    FROM bridge_transfers bt
    LEFT JOIN tokens.erc20 t
        ON t.contract_address = bt.token_address
        AND t.blockchain = 'ethereum'
    LEFT JOIN (
        SELECT
            contract_address,
            date_trunc('day', minute) AS price_day,
            AVG(price) AS price
        FROM prices.usd
        WHERE blockchain = 'ethereum'
            AND minute >= TIMESTAMP '2023-05-10'
        GROUP BY 1, 2
    ) p
        ON p.contract_address = bt.token_address
        AND p.price_day = date_trunc('day', bt.evt_block_time)
    WHERE bt.direction IS NOT NULL
)

SELECT
    COALESCE(t.symbol, 'Unknown') AS token_symbol,
    vt.token_address,
    SUM(CASE WHEN direction = 'deposit' THEN usd_value ELSE 0 END) AS total_deposits_usd,
    SUM(CASE WHEN direction = 'withdrawal' THEN usd_value ELSE 0 END) AS total_withdrawals_usd,
    SUM(CASE WHEN direction = 'deposit' THEN usd_value ELSE 0 END)
        - SUM(CASE WHEN direction = 'withdrawal' THEN usd_value ELSE 0 END) AS net_flow_usd,
    COUNT(*) AS transaction_count
FROM valued_transfers vt
LEFT JOIN tokens.erc20 t
    ON t.contract_address = vt.token_address
    AND t.blockchain = 'ethereum'
GROUP BY 1, 2
ORDER BY total_deposits_usd + total_withdrawals_usd DESC
LIMIT 50
