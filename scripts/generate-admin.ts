import 'dotenv/config';

import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.'
  );
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function main() {
  const adminId = uuidv4();
  const { error } = await supabase.from('admins').insert({ id: adminId });

  if (error) {
    console.error('Error creating admin:', error);
    process.exitCode = 1;
    return;
  }

  console.log(`New admin ID: ${adminId}`);
  console.log(`Demo URL: http://localhost:3000/demo/${adminId}`);
}

void main();