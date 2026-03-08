-- Tweet Analysis Tables (3 layers)

-- Layer 1: Python regex extraction (addresses, tokens, amounts)
CREATE TABLE IF NOT EXISTS research_extracted_entities (
    id SERIAL PRIMARY KEY,
    tweet_id TEXT NOT NULL REFERENCES research_tweets(id),
    entity_type TEXT NOT NULL,  -- address, token, amount, action, protocol
    entity_value TEXT NOT NULL,
    context TEXT DEFAULT '',    -- surrounding text snippet
    confidence REAL DEFAULT 1.0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Layer 2: LLM analysis (deeper understanding)
CREATE TABLE IF NOT EXISTS research_llm_analysis (
    id SERIAL PRIMARY KEY,
    tweet_id TEXT NOT NULL REFERENCES research_tweets(id) UNIQUE,
    summary TEXT NOT NULL,
    sentiment TEXT DEFAULT 'neutral',  -- bullish, bearish, neutral, warning, accusation
    action_detected TEXT,              -- dump, bridge, accumulate, swap, manipulate, none
    addresses_mentioned JSONB DEFAULT '[]'::jsonb,
    tokens_mentioned JSONB DEFAULT '[]'::jsonb,
    amounts_mentioned JSONB DEFAULT '[]'::jsonb,
    relationships JSONB DEFAULT '[]'::jsonb,  -- [{from, to, type, detail}]
    risk_level TEXT DEFAULT 'low',     -- low, medium, high, critical
    raw_response JSONB,
    model_used TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Layer 3: Synthesized conclusions (combined Python + LLM)
CREATE TABLE IF NOT EXISTS research_intel_conclusions (
    id SERIAL PRIMARY KEY,
    conclusion_type TEXT NOT NULL,  -- address_profile, event, pattern, alert
    subject TEXT NOT NULL,          -- address or event identifier
    title TEXT NOT NULL,
    summary TEXT NOT NULL,
    evidence JSONB DEFAULT '[]'::jsonb,  -- [{tweet_id, source: "regex"|"llm", detail}]
    addresses_involved JSONB DEFAULT '[]'::jsonb,
    tokens_involved JSONB DEFAULT '[]'::jsonb,
    risk_level TEXT DEFAULT 'low',
    first_seen TIMESTAMPTZ,
    last_seen TIMESTAMPTZ,
    tweet_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_extracted_tweet ON research_extracted_entities(tweet_id);
CREATE INDEX IF NOT EXISTS idx_extracted_type ON research_extracted_entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_extracted_value ON research_extracted_entities(entity_value);
CREATE INDEX IF NOT EXISTS idx_llm_tweet ON research_llm_analysis(tweet_id);
CREATE INDEX IF NOT EXISTS idx_llm_sentiment ON research_llm_analysis(sentiment);
CREATE INDEX IF NOT EXISTS idx_llm_action ON research_llm_analysis(action_detected);
CREATE INDEX IF NOT EXISTS idx_conclusions_type ON research_intel_conclusions(conclusion_type);
CREATE INDEX IF NOT EXISTS idx_conclusions_subject ON research_intel_conclusions(subject);
CREATE INDEX IF NOT EXISTS idx_conclusions_risk ON research_intel_conclusions(risk_level);

-- RLS
ALTER TABLE research_extracted_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_llm_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE research_intel_conclusions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_extracted" ON research_extracted_entities
    FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_llm" ON research_llm_analysis
    FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "service_role_conclusions" ON research_intel_conclusions
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "authenticated_read_conclusions" ON research_intel_conclusions
    FOR SELECT USING (auth.role() = 'authenticated');
