-- Token Sentiment: AI-analyzed dual-perspective sentiment per token
-- Community (insiders/holders) vs External (outsiders/critics) + meta-analysis verdict
-- One row per token, upserted by the sentiment analyzer script

CREATE TABLE IF NOT EXISTS token_sentiment (
  token_address TEXT PRIMARY KEY,
  token_symbol TEXT,

  -- Community view (insiders/holders)
  community_score INT,                                -- 0-100
  community_tweet_count INT DEFAULT 0,
  community_positive_count INT DEFAULT 0,
  community_negative_count INT DEFAULT 0,
  community_arguments JSONB DEFAULT '[]'::jsonb,
  -- [{stance, argument, frequency, source_tweet_ids, ai_evaluation: {factual, evidence, pertinence_score, conclusion}}]

  -- External view (outsiders/critics)
  external_score INT,                                 -- 0-100
  external_tweet_count INT DEFAULT 0,
  external_positive_count INT DEFAULT 0,
  external_negative_count INT DEFAULT 0,
  external_arguments JSONB DEFAULT '[]'::jsonb,

  -- Meta-analysis verdict (neutral LLM assessment of all arguments)
  verdict JSONB DEFAULT '{}'::jsonb,
  -- {overall_assessment, positive_validity, negative_validity, key_facts_confirmed, key_facts_debunked, unverifiable_claims, risk_factors, conclusion}

  -- History tracking
  sentiment_history JSONB DEFAULT '[]'::jsonb,
  -- [{date, community_score, external_score, community_tweets, external_tweets}]

  analyzed_tweet_count INT DEFAULT 0,
  last_analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_sentiment_symbol ON token_sentiment(token_symbol);
CREATE INDEX IF NOT EXISTS idx_token_sentiment_analyzed ON token_sentiment(last_analyzed_at DESC);

-- RLS
ALTER TABLE token_sentiment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "token_sentiment_anon_read" ON token_sentiment
  FOR SELECT TO anon USING (true);
CREATE POLICY "token_sentiment_auth_read" ON token_sentiment
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "token_sentiment_service" ON token_sentiment
  FOR ALL TO service_role USING (true);
