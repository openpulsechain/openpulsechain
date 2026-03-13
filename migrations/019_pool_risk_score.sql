-- Pool Risk Score: graduated 0-100 score replacing binary is_legitimate (Finding #4)
-- Score = 100 - sum(penalties). Each spam_reason deducts points by severity.

ALTER TABLE token_pools_live ADD COLUMN IF NOT EXISTS pool_risk_score INTEGER;
ALTER TABLE token_monitoring_pools ADD COLUMN IF NOT EXISTS pool_risk_score INTEGER;

COMMENT ON COLUMN token_pools_live.pool_risk_score IS 'Risk score 0-100. 100=safe, 0=spam. pool_is_legitimate derived as score >= 50.';
COMMENT ON COLUMN token_monitoring_pools.pool_risk_score IS 'Risk score 0-100 at time of snapshot.';
