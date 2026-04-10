-- ============================================
-- TRADE INFINITY — DATABASE SETUP
-- ============================================
-- Run this in Supabase → SQL Editor → New Query → Paste → Run
-- This creates all the tables you need.

-- 1. USERS TABLE — stores everyone who signs up
CREATE TABLE users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  password_hash TEXT NOT NULL,
  plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'trial', 'pro')),
  trial_start TIMESTAMPTZ,
  trial_end TIMESTAMPTZ,
  pro_start TIMESTAMPTZ,
  telegram_chat_id BIGINT,
  telegram_connected BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. ALERTS LOG — keeps a record of every alert sent
CREATE TABLE alerts_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  stock_name TEXT NOT NULL,
  entry_price NUMERIC NOT NULL,
  target_price NUMERIC NOT NULL,
  sl_price NUMERIC NOT NULL,
  strategy TEXT DEFAULT '52-Week High Breakout',
  triggered_at TIMESTAMPTZ DEFAULT NOW(),
  users_notified INTEGER DEFAULT 0
);

-- 3. CUSTOM STRATEGY REQUESTS — when users submit from the website
CREATE TABLE strategy_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  instrument TEXT,
  strategy_name TEXT,
  description TEXT NOT NULL,
  entry_rule TEXT,
  target_rule TEXT,
  sl_rule TEXT,
  timeframe TEXT,
  contact_pref TEXT DEFAULT 'WhatsApp',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'contacted', 'completed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (keeps data safe)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategy_requests ENABLE ROW LEVEL SECURITY;

-- Allow the backend (service role) to do everything
-- These policies let your bot server read/write data
CREATE POLICY "Allow all for service role" ON users FOR ALL USING (true);
CREATE POLICY "Allow all for service role" ON alerts_log FOR ALL USING (true);
CREATE POLICY "Allow all for service role" ON strategy_requests FOR ALL USING (true);
