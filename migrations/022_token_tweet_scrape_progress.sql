-- Track scraping progress per token per quarter
-- Allows incremental historical backfill without re-scraping completed periods

CREATE TABLE IF NOT EXISTS token_tweet_scrape_progress (
  id SERIAL PRIMARY KEY,
  token_address TEXT NOT NULL,
  token_symbol TEXT,
  search_type TEXT NOT NULL,        -- 'symbol' or 'address'
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT DEFAULT 'pending',    -- pending, in_progress, done, failed
  tweet_count INT DEFAULT 0,
  scraped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(token_address, search_type, period_start)
);

CREATE INDEX IF NOT EXISTS idx_scrape_progress_status ON token_tweet_scrape_progress(status) WHERE status != 'done';
CREATE INDEX IF NOT EXISTS idx_scrape_progress_token ON token_tweet_scrape_progress(token_address);

-- Top voices per token (recurring professional accounts)
CREATE TABLE IF NOT EXISTS token_top_voices (
  id SERIAL PRIMARY KEY,
  token_address TEXT NOT NULL,
  token_symbol TEXT,
  author_username TEXT NOT NULL,
  author_name TEXT,
  author_followers INT DEFAULT 0,
  author_is_verified BOOLEAN DEFAULT FALSE,
  tweet_count INT DEFAULT 0,
  total_engagement INT DEFAULT 0,     -- likes + RT*2 + quotes*3
  avg_sentiment FLOAT,
  is_intel_account BOOLEAN DEFAULT FALSE,  -- from research_followed_accounts
  first_mention TIMESTAMPTZ,
  last_mention TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(token_address, author_username)
);

CREATE INDEX IF NOT EXISTS idx_top_voices_token ON token_top_voices(token_address);

-- RLS
ALTER TABLE token_tweet_scrape_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_top_voices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scrape_progress_read" ON token_tweet_scrape_progress FOR SELECT TO authenticated USING (true);
CREATE POLICY "scrape_progress_service" ON token_tweet_scrape_progress FOR ALL TO service_role USING (true);

CREATE POLICY "top_voices_read" ON token_top_voices FOR SELECT TO authenticated USING (true);
CREATE POLICY "top_voices_service" ON token_top_voices FOR ALL TO service_role USING (true);
