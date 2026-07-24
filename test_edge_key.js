global.WebSocket = class {};
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://mktqccyyzfdutipqlomm.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rdHFjY3l5emZkdXRpcHFsb21tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNDc2MDcsImV4cCI6MjA5MTcyMzYwN30.witPYK3C6z-oLknhWiu3h-uK2qCVKA4tyKh14W9c1Ho';

async function checkKey() {
  const url = `${supabaseUrl}/functions/v1/create-order`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ user_id: 'b4b7d458-935c-49f2-993a-3bc678c2' })
  });

  const data = await res.json().catch(() => ({}));
  console.log('Edge Function Response:', data);
  if (data.key_id) {
    if (data.key_id.startsWith('rzp_test_')) {
      console.log('SUCCESS: Supabase secrets are indeed configured with TEST keys:', data.key_id);
    } else {
      console.log('WARNING: Supabase secrets are configured with LIVE keys:', data.key_id);
    }
  } else {
    console.log('Error: key_id not found in response:', data);
  }
}

checkKey();
