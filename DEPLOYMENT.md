# Lynk Deployment Guide

## Quick Setup

The application requires database tables that need to be created manually in your Supabase dashboard.

### 1. Database Setup

Go to your Supabase project dashboard → SQL Editor and run the following SQL:

```sql
-- Create the main sessions table
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
    expires_at TIMESTAMPTZ
);

-- Create user tiers table
CREATE TABLE IF NOT EXISTS user_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE,
    tier TEXT NOT NULL DEFAULT 'FREE_VERIFIED' CHECK (tier IN ('FREE_GUEST', 'FREE_VERIFIED', 'PRO')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE lynk_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_tiers ENABLE ROW LEVEL SECURITY;

-- Create policies for server access (using service role key)
CREATE POLICY "Server access to lynk_sessions" ON lynk_sessions FOR ALL USING (true);
CREATE POLICY "Server access to user_tiers" ON user_tiers FOR ALL USING (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_lynk_sessions_user ON lynk_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_lynk_sessions_expires ON lynk_sessions(expires_at) WHERE expires_at IS NOT NULL;
```

### 2. Environment Variables

Make sure these are set in your deployment environment:

- `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key (for server-side operations)
- `OPENAI_API_KEY`: Your OpenAI API key
- Any other API keys for supported models (Google AI, etc.)

### 3. Deploy

The app should now deploy successfully with the database tables in place.

## Troubleshooting

If you see "Could not find the table 'public.lynk_sessions'" error:
1. Make sure you ran the SQL commands above in your Supabase SQL Editor
2. Check that RLS policies are correctly set
3. Verify your service role key has proper permissions

## Migration Script (Alternative)

If you prefer using the migration script, you'll need to first create this function in your Supabase SQL Editor:

```sql
CREATE OR REPLACE FUNCTION exec_raw_sql(query text)
RETURNS void AS $$
BEGIN
  EXECUTE query;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

Then you can run: `npm run migrate`