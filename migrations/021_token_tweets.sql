-- Token Tweet Intelligence tables
-- Phase 1: token_tweets (raw scraped tweets per token)
-- Phase 2: token_tweet_stories (AI-analyzed clustered stories)

CREATE TABLE IF NOT EXISTS token_tweets (
  id TEXT PRIMARY KEY,                          -- tweet_id
  token_address TEXT NOT NULL,
  token_symbol TEXT,
  text TEXT,
  author_username TEXT,
  author_name TEXT,
  author_profile_pic TEXT,
  author_followers INT DEFAULT 0,
  author_is_verified BOOLEAN DEFAULT FALSE,
  tweet_url TEXT,
  lang TEXT,
  like_count INT DEFAULT 0,
  retweet_count INT DEFAULT 0,
  reply_count INT DEFAULT 0,
  quote_count INT DEFAULT 0,
  media_urls JSONB DEFAULT '[]',
  media_types JSONB DEFAULT '[]',
  tweeted_at TIMESTAMPTZ,
  processed BOOLEAN DEFAULT FALSE,
  story_id UUID,
  cluster_processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_tweets_address ON token_tweets(token_address);
CREATE INDEX IF NOT EXISTS idx_token_tweets_processed ON token_tweets(processed) WHERE processed = FALSE;
CREATE INDEX IF NOT EXISTS idx_token_tweets_cluster ON token_tweets(cluster_processed) WHERE cluster_processed = FALSE;
CREATE INDEX IF NOT EXISTS idx_token_tweets_tweeted_at ON token_tweets(tweeted_at DESC);

CREATE TABLE IF NOT EXISTS token_tweet_stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_address TEXT NOT NULL,
  token_symbol TEXT,
  slug TEXT UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT,
  summary TEXT,
  content JSONB DEFAULT '[]',
  sentiment_score INT,                          -- 0-100
  sentiment_label TEXT,                         -- Très baissier → Très haussier
  market_impact TEXT,                           -- haussier | baissier | neutre
  source_tweet_ids JSONB DEFAULT '[]',
  author_handles JSONB DEFAULT '[]',
  source_count INT DEFAULT 0,
  importance_score FLOAT DEFAULT 0,
  is_featured BOOLEAN DEFAULT FALSE,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  model_used TEXT,
  published_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_stories_address ON token_tweet_stories(token_address);
CREATE INDEX IF NOT EXISTS idx_token_stories_published ON token_tweet_stories(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_stories_slug ON token_tweet_stories(slug);

-- RLS policies
ALTER TABLE token_tweets ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_tweet_stories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "token_tweets_anon_read" ON token_tweets FOR SELECT TO anon USING (true);
CREATE POLICY "token_tweets_read" ON token_tweets FOR SELECT TO authenticated USING (true);
CREATE POLICY "token_tweets_service" ON token_tweets FOR ALL TO service_role USING (true);

CREATE POLICY "token_stories_anon_read" ON token_tweet_stories FOR SELECT TO anon USING (true);
CREATE POLICY "token_stories_read" ON token_tweet_stories FOR SELECT TO authenticated USING (true);
CREATE POLICY "token_stories_service" ON token_tweet_stories FOR ALL TO service_role USING (true);
