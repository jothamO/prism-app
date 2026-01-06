-- Migration: Add team collaboration tables
-- Run this in Supabase SQL Editor

-- Team members table
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_email TEXT NOT NULL,
  member_user_id UUID REFERENCES users(id),
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'accountant')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'revoked')),
  invite_token TEXT UNIQUE,
  invited_at TIMESTAMPTZ DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, member_email)
);

-- Transaction notes (for accountant comments)
CREATE TABLE IF NOT EXISTS transaction_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES bank_transactions(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  note_type TEXT DEFAULT 'comment' CHECK (note_type IN ('comment', 'flag', 'suggestion')),
  is_ai_reviewed BOOLEAN DEFAULT FALSE,
  ai_insights JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Team activity log (for notifications)
CREATE TABLE IF NOT EXISTS team_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id UUID,
  metadata JSONB,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_team_members_user ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_member ON team_members(member_user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_token ON team_members(invite_token);
CREATE INDEX IF NOT EXISTS idx_transaction_notes_txn ON transaction_notes(transaction_id);
CREATE INDEX IF NOT EXISTS idx_team_activity_user ON team_activity(user_id, is_read);

-- RLS Policies
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_activity ENABLE ROW LEVEL SECURITY;

-- Team members: Owner can manage, members can view
CREATE POLICY "Users can view their team" ON team_members
  FOR SELECT USING (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()) OR
    member_user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
  );

CREATE POLICY "Users can manage their team" ON team_members
  FOR ALL USING (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
  );

-- Transaction notes: Team members with access can view/create
CREATE POLICY "Team can view transaction notes" ON transaction_notes
  FOR SELECT USING (
    transaction_id IN (
      SELECT bt.id FROM bank_transactions bt
      WHERE bt.user_id IN (
        SELECT user_id FROM team_members 
        WHERE member_user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
        AND status = 'active'
      ) OR bt.user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
    )
  );

CREATE POLICY "Team can create notes" ON transaction_notes
  FOR INSERT WITH CHECK (
    author_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
  );

-- Team activity: User can view their activity
CREATE POLICY "Users can view their activity" ON team_activity
  FOR SELECT USING (
    user_id IN (SELECT id FROM users WHERE auth_id = auth.uid())
  );

CREATE POLICY "System can create activity" ON team_activity
  FOR INSERT WITH CHECK (true);
