import 'dotenv/config';

import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import WebSocket from 'ws';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || 'http://localhost:3000';

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.'
  );
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    transport: WebSocket as unknown as never,
  },
});

async function generateUniqueAdminId() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidateId = uuidv4();
    const { data, error } = await supabase
      .from('admins')
      .select('id')
      .eq('id', candidateId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return candidateId;
    }
  }

  throw new Error('Unable to generate a unique admin ID after several attempts.');
}

async function main() {
  const adminId = await generateUniqueAdminId();
  const { error } = await supabase.from('admins').insert({ id: adminId });

  if (error) {
    console.error('Error creating admin:', error);
    process.exitCode = 1;
    return;
  }

  console.log(`New admin ID: ${adminId}`);
  console.log(`Saved to database: yes`);
  console.log(`Demo URL: ${appUrl.replace(/\/$/, '')}/demo/${adminId}`);
  console.log(`Direct chat URL: ${appUrl.replace(/\/$/, '')}/chat`);
}

void main();