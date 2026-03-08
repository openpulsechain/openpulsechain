-- Tables pour le tweet scraper OpenPulsechain
-- Noms neutres : research_followed_accounts + research_tweets

-- Comptes à suivre
CREATE TABLE IF NOT EXISTS research_followed_accounts (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT DEFAULT '',
    category TEXT DEFAULT 'onchain',  -- onchain, ecosystem, analytics
    priority INTEGER DEFAULT 5,
    is_active BOOLEAN DEFAULT TRUE,
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tweets collectés
CREATE TABLE IF NOT EXISTS research_tweets (
    id TEXT PRIMARY KEY,  -- Twitter tweet ID
    text TEXT NOT NULL,
    author_username TEXT NOT NULL,
    author_name TEXT DEFAULT '',
    author_profile_pic TEXT DEFAULT '',
    author_followers INTEGER DEFAULT 0,
    author_is_verified BOOLEAN DEFAULT FALSE,
    tweet_url TEXT NOT NULL,
    lang TEXT DEFAULT '',
    like_count INTEGER DEFAULT 0,
    retweet_count INTEGER DEFAULT 0,
    reply_count INTEGER DEFAULT 0,
    quote_count INTEGER DEFAULT 0,
    bookmark_count INTEGER DEFAULT 0,
    is_reply BOOLEAN DEFAULT FALSE,
    is_retweet BOOLEAN DEFAULT FALSE,
    media_urls JSONB DEFAULT '[]'::jsonb,
    media_types JSONB DEFAULT '[]'::jsonb,
    card_url TEXT,
    card_title TEXT,
    tweeted_at TIMESTAMPTZ,
    processed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_research_tweets_author ON research_tweets(author_username);
CREATE INDEX IF NOT EXISTS idx_research_tweets_tweeted_at ON research_tweets(tweeted_at DESC);
CREATE INDEX IF NOT EXISTS idx_research_tweets_processed ON research_tweets(processed);

-- RLS
ALTER TABLE research_followed_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_tweets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access_accounts" ON research_followed_accounts
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "service_role_full_access_tweets" ON research_tweets
    FOR ALL USING (auth.role() = 'service_role');

-- Lecture pour les utilisateurs authentifiés
CREATE POLICY "authenticated_read_tweets" ON research_tweets
    FOR SELECT USING (auth.role() = 'authenticated');
