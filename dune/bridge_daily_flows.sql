-- Title:       PulseChain Bridge - Daily Flows
-- Description: Daily deposits (ETH -> PulseChain) and withdrawals (PulseChain -> ETH)
--              with USD valuation and cumulative net flow.
-- Chain:       Ethereum mainnet
-- Contracts:   OmniBridge Proxy: 0x1715a3e4a142d8b698131108995174f37aeba10d
--              WETH Router:      0x8ac4ae65b3656e26dc4e0e69108b392283350f55
-- Output:      day, deposits_usd, withdrawals_usd, net_flow_usd, cumulative_net_flow_usd
-- Author:      pulsechain-analytics
-- Dune Link:   (pending publication)
--
-- Methodology:
--   Deposits  = ERC20 Transfer events TO the bridge contract (tokens locked on Ethereum)
--   Withdrawals = ERC20 Transfer events FROM the bridge contract (tokens released on Ethereum)
--   USD value derived from prices.usd joined on token address and day.

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
        date_trunc('day', evt_block_time) AS day,
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
    AND evt_block_time >= TIMESTAMP '2023-05-10'  -- PulseChain mainnet launch
),

valued_transfers AS (
    SELECT
        bt.day,
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
        AND p.price_day = bt.day
    WHERE bt.direction IS NOT NULL
),

daily_summary AS (
    SELECT
        day,
        SUM(CASE WHEN direction = 'deposit' THEN usd_value ELSE 0 END) AS deposits_usd,
        SUM(CASE WHEN direction = 'withdrawal' THEN usd_value ELSE 0 END) AS withdrawals_usd,
        SUM(CASE WHEN direction = 'deposit' THEN usd_value ELSE 0 END)
            - SUM(CASE WHEN direction = 'withdrawal' THEN usd_value ELSE 0 END) AS net_flow_usd
    FROM valued_transfers
    GROUP BY day
)

SELECT
    day,
    deposits_usd,
    withdrawals_usd,
    net_flow_usd,
    SUM(net_flow_usd) OVER (ORDER BY day) AS cumulative_net_flow_usd
FROM daily_summary
ORDER BY day DESC
