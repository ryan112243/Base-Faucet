-- 建立 faucet_claims 表
CREATE TABLE IF NOT EXISTS faucet_claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address TEXT NOT NULL,
    ip_address TEXT NOT NULL,
    claimed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    amount_sent NUMERIC NOT NULL,
    tx_hash TEXT NOT NULL
);

-- 建立索引以加速查詢
CREATE INDEX IF NOT EXISTS idx_faucet_claims_wallet_address ON faucet_claims (wallet_address);
CREATE INDEX IF NOT EXISTS idx_faucet_claims_ip_address ON faucet_claims (ip_address);
CREATE INDEX IF NOT EXISTS idx_faucet_claims_claimed_at ON faucet_claims (claimed_at);

-- 啟用 Row Level Security (RLS)
ALTER TABLE faucet_claims ENABLE ROW LEVEL SECURITY;

-- 移除所有預設存取權限
DROP POLICY IF EXISTS "Deny all public access" ON faucet_claims;
DROP POLICY IF EXISTS "Allow service role access" ON faucet_claims;

-- 建立策略：拒絕所有 Public 的讀寫存取
CREATE POLICY "Deny all public access" 
ON faucet_claims
FOR ALL 
TO public 
USING (false);

-- 建立策略：僅允許使用 service_role 進行所有操作
CREATE POLICY "Allow service role access"
ON faucet_claims
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
