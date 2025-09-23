-- Create snapshots table for storing chat conversation summaries
CREATE TABLE IF NOT EXISTS snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  session_id UUID NOT NULL,
  turn_index INTEGER NOT NULL,
  summary_text TEXT NOT NULL,
  message_ids TEXT[] NOT NULL DEFAULT '{}',
  model TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_snapshots_user_id ON snapshots(user_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_session_id ON snapshots(session_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_turn_index ON snapshots(turn_index);

-- Enable Row Level Security
ALTER TABLE snapshots ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only select and insert their own snapshots
CREATE POLICY snapshots_owner_policy ON snapshots
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);