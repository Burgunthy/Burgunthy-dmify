CREATE TABLE IF NOT EXISTS usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
    month TEXT NOT NULL,
    comments_received INTEGER DEFAULT 0,
    dms_sent INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, month)
);

CREATE INDEX IF NOT EXISTS idx_usage_user_month ON usage(user_id, month);

ALTER TABLE usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own usage" ON usage FOR SELECT USING (
    user_id IN (SELECT id FROM users WHERE auth.uid() = id)
);

CREATE TRIGGER usage_updated_at BEFORE UPDATE ON usage
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
