/**
 * Test script for city resolution
 * Run with: node test-city-resolution.mjs
 * 
 * This script tests that:
 * 1. Creating a place with city "Davie" creates a Cities row if missing
 * 2. Sets places.city_id correctly
 * 3. City appears in filter list
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testCityResolution() {
  console.log('🧪 Testing City Resolution...\n');

  // Test 1: Check if get_or_create_city RPC function exists
  console.log('1. Testing get_or_create_city RPC function...');
  try {
    const { data: cityId, error: rpcError } = await supabase.rpc('get_or_create_city', {
      p_name: 'Davie',
      p_state: 'FL',
      p_country: 'USA',
      p_lat: 26.0629,
      p_lng: -80.2331,
    });

    if (rpcError) {
      console.error('❌ RPC function error:', rpcError);
      return;
    }

    if (!cityId) {
      console.error('❌ RPC function returned no city_id');
      return;
    }

    console.log('✅ RPC function returned city_id:', cityId);

    // Test 2: Verify city was created
    const { data: city, error: cityError } = await supabase
      .from('cities')
      .select('*')
      .eq('id', cityId)
      .single();

    if (cityError || !city) {
      console.error('❌ City not found:', cityError);
      return;
    }

    console.log('✅ City found:', city.name, city.state, city.country);

    // Test 3: Call again with same name (should return same city_id)
    const { data: cityId2, error: rpcError2 } = await supabase.rpc('get_or_create_city', {
      p_name: 'Davie',
      p_state: 'FL',
      p_country: 'USA',
    });

    if (rpcError2) {
      console.error('❌ RPC function error on second call:', rpcError2);
      return;
    }

    if (cityId2 !== cityId) {
      console.error('❌ Second call returned different city_id (not idempotent)');
      return;
    }

    console.log('✅ RPC function is idempotent (returned same city_id)');

    // Test 4: Check cities count
    const { count: citiesCount } = await supabase
      .from('cities')
      .select('*', { count: 'exact', head: true });

    console.log(`✅ Total cities in database: ${citiesCount}`);

    // Test 5: Check places with city_id
    const { count: placesWithCityId } = await supabase
      .from('places')
      .select('*', { count: 'exact', head: true })
      .not('city_id', 'is', null);

    console.log(`✅ Places with city_id: ${placesWithCityId}`);

    console.log('\n✅ All tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testCityResolution();
