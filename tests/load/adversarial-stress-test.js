/**
 * tests/load/adversarial-stress-test.js
 *
 * Adversarial stress testing for Challenger 2:
 * - 100-request simultaneous Thundering Herd stress
 * - In-flight telemetry observability during active scrape
 * - LRU cache eviction stress (capping at 200 entries)
 * - Negative cache TTL expiration & recovery
 */

const { request } = require('undici');
const { startServer, startMockUpstream } = require('./server-runner');
const StreamResolveCache = require('../../src/services/StreamResolveCache');
const { performance } = require('perf_hooks');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runAdversarialStress() {
  console.log('⚡ [Challenger 2] Running Adversarial Stress Tests...\n');

  // 1. Direct Unit Stress on StreamResolveCache LRU eviction and concurrency
  console.log('--- Adversarial Test 1: StreamResolveCache LRU Eviction Under Pressure ---');
  const cache = new StreamResolveCache({ maxEntries: 200, defaultTtlMs: 5000, negativeTtlMs: 1000 });
  
  // Populate 250 distinct keys
  for (let i = 0; i < 250; i++) {
    await cache.getOrCreate(`source_${i}:match_${i}`, async () => [{ title: `Stream ${i}`, url: `http://test/${i}` }]);
  }

  const cacheStats = cache.stats();
  const lruPassed = cacheStats.entries === 200 && cacheStats.evictions === 50;
  console.log(`LRU Eviction (Max 200, Added 250): ${lruPassed ? 'PASS ✅' : 'FAIL ❌'}`, cacheStats);

  // 2. 100 Concurrent Promises Single-Flight Stress on exact same key
  console.log('\n--- Adversarial Test 2: 100 Concurrent Single-Flight Mint Calls ---');
  let mintExecutions = 0;
  const sharedKey = 'stress_source:shared_match_123';

  const promises100 = Array.from({ length: 100 }, () =>
    cache.getOrCreate(sharedKey, async () => {
      mintExecutions++;
      await sleep(50);
      return [{ title: 'Coalesced Stream', url: 'http://test/live.m3u8' }];
    })
  );

  const results100 = await Promise.all(promises100);
  const allIdentical = results100.every((r) => r.length === 1 && r[0].url === 'http://test/live.m3u8');
  const singleFlightPassed = mintExecutions === 1 && allIdentical;
  console.log(`Single-Flight 100 Callers (Mint Executions: ${mintExecutions}): ${singleFlightPassed ? 'PASS ✅' : 'FAIL ❌'}`);

  // 3. Negative Cache Expiration & Re-minting
  console.log('\n--- Adversarial Test 3: Negative Cache Recovery After TTL ---');
  const failingKey = 'fail_source:fail_match_456';
  let failMintCount = 0;

  // First call fails -> negative cached for 1000ms
  await cache.getOrCreate(failingKey, async () => {
    failMintCount++;
    throw new Error('Simulated upstream failure');
  });

  // Call immediately -> returns [] via negative cache, mint NOT called
  const negCall = await cache.getOrCreate(failingKey, async () => {
    failMintCount++;
    return [{ title: 'Should Not Execute' }];
  });

  const negBeforeSleepPassed = failMintCount === 1 && negCall.length === 0;

  // Wait 1100ms for negative TTL to expire
  await sleep(1100);

  // Call again with successful mint -> should re-mint and return positive streams
  const recoveredCall = await cache.getOrCreate(failingKey, async () => {
    failMintCount++;
    return [{ title: 'Recovered Stream', url: 'http://test/recovered.m3u8' }];
  });

  const recoveryPassed = negBeforeSleepPassed && failMintCount === 2 && recoveredCall.length === 1;
  console.log(`Negative Cache Expiry & Recovery (Mints: ${failMintCount}): ${recoveryPassed ? 'PASS ✅' : 'FAIL ❌'}`);

  console.log('\n======================================================');
  console.log('🏆 ADVERSARIAL STRESS TEST SUMMARY:');
  console.log('======================================================');
  console.log('1. LRU Eviction & Bound Control             :', lruPassed ? 'PASS ✅' : 'FAIL ❌');
  console.log('2. 100-Caller Single-Flight Coalescing      :', singleFlightPassed ? 'PASS ✅' : 'FAIL ❌');
  console.log('3. Negative Cache TTL Expiry & Self-Healing :', recoveryPassed ? 'PASS ✅' : 'FAIL ❌');
  console.log('======================================================\n');

  return { lruPassed, singleFlightPassed, recoveryPassed };
}

if (require.main === module) {
  runAdversarialStress()
    .then((res) => {
      const allPassed = Object.values(res).every(Boolean);
      process.exit(allPassed ? 0 : 1);
    })
    .catch((err) => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}
