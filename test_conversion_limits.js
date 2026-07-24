global.WebSocket = class {};
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://mktqccyyzfdutipqlomm.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rdHFjY3l5emZkdXRpcHFsb21tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNDc2MDcsImV4cCI6MjA5MTcyMzYwN30.witPYK3C6z-oLknhWiu3h-uK2qCVKA4tyKh14W9c1Ho';

// Minimal implementations of getDailyConversions and recordConversion
async function getDailyConversions(client, userId) {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await client
    .from('usage_snapshots')
    .select('id')
    .eq('user_id', userId)
    .eq('platform', 'convert')
    .gte('captured_at', oneDayAgo)

  if (error) {
    console.error('Error fetching count:', error.message)
    return 0
  }
  return data?.length ?? 0
}

async function recordConversion(client, userId) {
  const { error } = await client
    .from('usage_snapshots')
    .insert({
      user_id: userId,
      platform: 'convert',
      session_utilization: 1.0,
      weekly_utilization: 1.0,
      session_reset_at: new Date().toISOString(),
      weekly_reset_at: new Date().toISOString(),
      captured_at: new Date().toISOString(),
      source_version: '1.0'
    })

  if (error) {
    console.error('Error recording conversion:', error.message)
  }
}

async function runTest() {
  const email = `limit_test_${Date.now().toString().slice(-6)}@gmail.com`;
  const password = 'TestPassword123!';

  console.log(`1. Creating test user: ${email}...`);
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
  if (authError) {
    console.error('Sign Up failed:', authError.message);
    return;
  }
  const userId = authData.user.id;
  console.log(`User created. ID: ${userId}`);

  // Create an authenticated client
  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  await authClient.auth.setSession({
    access_token: authData.session.access_token,
    refresh_token: authData.session.refresh_token
  });

  // Check initial count
  let count = await getDailyConversions(authClient, userId);
  console.log(`2. Initial daily conversions count: ${count} (expected: 0)`);

  // Record 1 conversion
  console.log(`3. Recording one file conversion...`);
  await recordConversion(authClient, userId);

  // Check count after conversion
  count = await getDailyConversions(authClient, userId);
  console.log(`4. Daily conversions count after recording: ${count} (expected: 1)`);

  // Simulate logout/login by creating a fresh authenticated client and checking
  console.log(`5. Simulating logout/login (session reset)...`);
  const freshClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const { data: signInData, error: signInError } = await freshClient.auth.signInWithPassword({ email, password });
  if (signInError) {
    console.error('Sign In failed:', signInError.message);
    return;
  }

  // Check count in fresh session
  count = await getDailyConversions(freshClient, userId);
  console.log(`6. Daily conversions count in new session: ${count} (expected: 1)`);
  if (count === 1) {
    console.log(`SUCCESS: Conversions limit is account-tied and persists across sessions/logouts!`);
  } else {
    console.log(`FAILURE: Limit was lost!`);
  }
}

runTest();
