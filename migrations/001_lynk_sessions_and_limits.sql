-- Migration: Lynk Sessions and Limits Infrastructure
-- This migration adds the missing tables for session persistence, quotas, and proper user management

-- User tiers and quota tracking
CREATE TABLE IF NOT EXISTS user_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE,
    tier TEXT NOT NULL DEFAULT 'FREE_VERIFIED' CHECK (tier IN ('FREE_GUEST', 'FREE_VERIFIED', 'PRO')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User quota tracking (daily/monthly limits)
CREATE TABLE IF NOT EXISTS user_quotas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    quota_type TEXT NOT NULL CHECK (quota_type IN ('daily_messages', 'monthly_vision', 'monthly_snapshots')),
    quota_date DATE NOT NULL, -- For daily: specific date, for monthly: first day of month
    count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, quota_type, quota_date)
);

-- Enhanced sessions table (if doesn't exist already)
CREATE TABLE IF NOT EXISTS lynk_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL UNIQUE,
    user_id UUID,
    title TEXT,
    tier TEXT NOT NULL DEFAULT 'FREE_GUEST' CHECK (tier IN ('FREE_GUEST', 'FREE_VERIFIED', 'PRO')),
    is_guest BOOLEAN NOT NULL DEFAULT true,
    model_provider TEXT,
    model_name TEXT,
    topic_counts JSONB DEFAULT '{}'::jsonb,
    last_snapshot_user_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ -- For guest sessions with TTL
);

-- Session messages/turns
CREATE TABLE IF NOT EXISTS lynk_session_turns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL REFERENCES lynk_sessions(session_id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    provider TEXT,
    model TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Session snapshots/live notes
CREATE TABLE IF NOT EXISTS lynk_session_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL REFERENCES lynk_sessions(session_id) ON DELETE CASCADE,
    snapshot_id TEXT NOT NULL,
    from_turn INTEGER NOT NULL,
    to_turn INTEGER NOT NULL,
    key_topics JSONB DEFAULT '[]'::jsonb,
    discussion TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Command suggestions
CREATE TABLE IF NOT EXISTS lynk_session_commands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL REFERENCES lynk_sessions(session_id) ON DELETE CASCADE,
    slug TEXT NOT NULL,
    command TEXT NOT NULL,
    confidence TEXT DEFAULT 'high',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Request logs for observability
CREATE TABLE IF NOT EXISTS lynk_request_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    session_id TEXT,
    provider TEXT,
    model TEXT,
    tier TEXT,
    latency_ms INTEGER,
    limit_hit BOOLEAN DEFAULT FALSE,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_quotas_lookup ON user_quotas(user_id, quota_type, quota_date);
CREATE INDEX IF NOT EXISTS idx_lynk_sessions_user ON lynk_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_lynk_sessions_expires ON lynk_sessions(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_session_turns_session ON lynk_session_turns(session_id);
CREATE INDEX IF NOT EXISTS idx_session_snapshots_session ON lynk_session_snapshots(session_id);
CREATE INDEX IF NOT EXISTS idx_session_commands_session ON lynk_session_commands(session_id);
CREATE INDEX IF NOT EXISTS idx_request_logs_user_date ON lynk_request_logs(user_id, created_at);

-- Functions for quota management
CREATE OR REPLACE FUNCTION increment_user_quota(
    p_user_id UUID,
    p_quota_type TEXT,
    p_increment INTEGER DEFAULT 1
) RETURNS INTEGER AS $$
DECLARE
    quota_date DATE;
    current_count INTEGER;
BEGIN
    -- Determine the quota date based on type
    IF p_quota_type = 'daily_messages' THEN
        quota_date := CURRENT_DATE;
    ELSE
        -- Monthly quotas use first day of current month
        quota_date := date_trunc('month', CURRENT_DATE)::DATE;
    END IF;

    -- Upsert the quota record and return new count
    INSERT INTO user_quotas (user_id, quota_type, quota_date, count)
    VALUES (p_user_id, p_quota_type, quota_date, p_increment)
    ON CONFLICT (user_id, quota_type, quota_date)
    DO UPDATE SET count = user_quotas.count + p_increment, updated_at = NOW()
    RETURNING count INTO current_count;

    RETURN current_count;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION get_user_quota(
    p_user_id UUID,
    p_quota_type TEXT
) RETURNS INTEGER AS $$
DECLARE
    quota_date DATE;
    current_count INTEGER;
BEGIN
    -- Determine the quota date based on type
    IF p_quota_type = 'daily_messages' THEN
        quota_date := CURRENT_DATE;
    ELSE
        -- Monthly quotas use first day of current month
        quota_date := date_trunc('month', CURRENT_DATE)::DATE;
    END IF;

    SELECT count INTO current_count
    FROM user_quotas
    WHERE user_id = p_user_id
      AND quota_type = p_quota_type
      AND quota_date = quota_date;

    RETURN COALESCE(current_count, 0);
END;
$$ LANGUAGE plpgsql;

-- Clean up expired guest sessions
CREATE OR REPLACE FUNCTION cleanup_expired_guest_sessions() RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM lynk_sessions
    WHERE is_guest = TRUE
      AND expires_at IS NOT NULL
      AND expires_at < NOW();

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Row Level Security (RLS) policies
ALTER TABLE user_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE lynk_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lynk_session_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE lynk_session_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE lynk_session_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE lynk_request_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies (server-side access with service role key)
CREATE POLICY "Server access to user_tiers" ON user_tiers FOR ALL USING (true);
CREATE POLICY "Server access to user_quotas" ON user_quotas FOR ALL USING (true);
CREATE POLICY "Server access to lynk_sessions" ON lynk_sessions FOR ALL USING (true);
CREATE POLICY "Server access to lynk_session_turns" ON lynk_session_turns FOR ALL USING (true);
CREATE POLICY "Server access to lynk_session_snapshots" ON lynk_session_snapshots FOR ALL USING (true);
CREATE POLICY "Server access to lynk_session_commands" ON lynk_session_commands FOR ALL USING (true);
CREATE POLICY "Server access to lynk_request_logs" ON lynk_request_logs FOR ALL USING (true);