-- Token Intelligence: AI-synthesized project profiles from tweet analysis
-- One row per token, upserted by the analyzer script

CREATE TABLE IF NOT EXISTS token_intelligence (
  token_address TEXT PRIMARY KEY,
  token_symbol TEXT,

  -- Project summary (AI-generated from all tweets)
  project_summary JSONB DEFAULT '{}'::jsonb,
  -- {name, description, type, objective, team, launch_date, links}

  -- Social timeline: categorized events from tweet history
  social_timeline JSONB DEFAULT '[]'::jsonb,
  -- [{date, category, title, description, cause, impact, sentiment, source_tweet_ids}]

  -- Addresses mentioned across all tweets
  mentioned_addresses JSONB DEFAULT '[]'::jsonb,
  -- [{address, context, type, first_mentioned_at, mention_count, tweet_ids}]

  -- Chart image analyses (Claude Vision)
  chart_analyses JSONB DEFAULT '[]'::jsonb,
  -- [{tweet_id, image_url, analysis, date}]

  analyzed_tweet_count INT DEFAULT 0,
  last_analyzed_at TIMESTAMPTZ,
  model_version TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_intelligence_symbol ON token_intelligence(token_symbol);
CREATE INDEX IF NOT EXISTS idx_token_intelligence_updated ON token_intelligence(last_analyzed_at DESC);

-- RLS
ALTER TABLE token_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "token_intelligence_anon_read" ON token_intelligence
  FOR SELECT TO anon USING (true);
CREATE POLICY "token_intelligence_auth_read" ON token_intelligence
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "token_intelligence_service" ON token_intelligence
  FOR ALL TO service_role USING (true);
