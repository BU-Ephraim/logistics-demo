-- Create tables
CREATE TABLE admins (
  id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE drivers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID REFERENCES admins(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE orders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID REFERENCES admins(id) ON DELETE CASCADE,
  order_number SERIAL,
  customer_name TEXT NOT NULL,
  pickup TEXT NOT NULL,
  dropoff TEXT NOT NULL,
  phone TEXT NOT NULL,
  item TEXT,
  amount TEXT,
  status TEXT CHECK (status IN ('pending', 'assigned', 'delivered')) DEFAULT 'pending',
  driver_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ
);

CREATE TABLE messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_id UUID REFERENCES admins(id) ON DELETE CASCADE,
  chat_type TEXT CHECK (chat_type IN ('customer', 'bot', 'driver')),
  driver_name TEXT,
  sender TEXT CHECK (sender IN ('admin', 'bot', 'customer', 'driver')),
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bot_sessions (
  admin_id UUID PRIMARY KEY REFERENCES admins(id) ON DELETE CASCADE,
  step TEXT DEFAULT 'idle',
  pending_order_data JSONB
);

ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "demo admins read" ON admins;
DROP POLICY IF EXISTS "demo admins write" ON admins;
DROP POLICY IF EXISTS "demo admins update" ON admins;
DROP POLICY IF EXISTS "demo bot sessions read" ON bot_sessions;
DROP POLICY IF EXISTS "demo bot sessions write" ON bot_sessions;
DROP POLICY IF EXISTS "demo drivers read" ON drivers;
DROP POLICY IF EXISTS "demo drivers write" ON drivers;
DROP POLICY IF EXISTS "demo orders read" ON orders;
DROP POLICY IF EXISTS "demo orders write" ON orders;
DROP POLICY IF EXISTS "demo messages read" ON messages;
DROP POLICY IF EXISTS "demo messages write" ON messages;

CREATE POLICY "demo admins read"
ON admins FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "demo admins write"
ON admins FOR INSERT
TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "demo admins update"
ON admins FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "demo bot sessions read"
ON bot_sessions FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "demo bot sessions write"
ON bot_sessions FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "demo drivers read"
ON drivers FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "demo drivers write"
ON drivers FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "demo orders read"
ON orders FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "demo orders write"
ON orders FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "demo messages read"
ON messages FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "demo messages write"
ON messages FOR ALL
TO anon, authenticated
USING (true)
WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE orders;

-- Insert default drivers for each admin in app logic when an admin first uses the app.