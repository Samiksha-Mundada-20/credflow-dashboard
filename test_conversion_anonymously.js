global.WebSocket = class {};
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://mktqccyyzfdutipqlomm.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rdHFjY3l5emZkdXRpcHFsb21tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxNDc2MDcsImV4cCI6MjA5MTcyMzYwN30.witPYK3C6z-oLknhWiu3h-uK2qCVKA4tyKh14W9c1Ho';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const TEST_USER_ID = 'd9b0a1f9-715c-4235-90df-a387796d11a6';

async function getDailyConversions(userId) {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
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

async function recordConversion(userId) {
  const { error } = await supabase
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
  console.log(`Checking initial count for ${TEST_USER_ID}...`);
  let countBefore = await getDailyConversions(TEST_USER_ID);
  console.log(`Count before: ${countBefore}`);

  console.log(`Inserting one conversion...`);
  await recordConversion(TEST_USER_ID);

  let countAfter = await getDailyConversions(TEST_USER_ID);
  console.log(`Count after: ${countAfter}`);

  if (countAfter === countBefore + 1) {
    console.log(`SUCCESS: Dynamic database daily conversion limit tracks and queries successfully!`);
  } else {
    console.log(`FAILURE: Count did not increment correctly.`);
  }
}

runTest();
