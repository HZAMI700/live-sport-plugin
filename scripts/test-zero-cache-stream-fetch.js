/**
 * scripts/test-zero-cache-stream-fetch.js
 *
 * Programmatic Verification Suite: Zero-Cache Stream Fetching
 * 
 * Verifies Acceptance Criteria:
 * 1. Requests a stream twice in succession.
 * 2. Monitors upstream provider HTTP calls via an instrumented mock upstream server.
 * 3. Asserts upstream is contacted on BOTH requests (proving 0% cache hit and fresh fetching).
 * 4. Verifies absence of caching services in DI container.
 */

const http = require('http');
const assert = require('assert');
const container = require('../src/container');
const { handleStream } = require('../src/streams');

async function runZeroCacheVerification() {
  console.log('================================================================');
  console.log('🧪 Programmatic Test: Upstream Stream Fetching & Zero-Cache Hit');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function testAssert(name, condition, detail = '') {
    if (condition) {
      passed++;
      console.log(`  ✅ PASS: ${name}${detail ? ` (${detail})` : ''}`);
    } else {
      failed++;
      console.error(`  ❌ FAIL: ${name}${detail ? ` (${detail})` : ''}`);
    }
  }

  // ─── 0. Container Sanity Check ─────────────────────────────────────────────
  console.log('👉 Verifying DI Container Registrations...');
  let hasCacheService = false;
  let hasStreamResolveCache = false;
  try {
    container.resolve('cacheService');
    hasCacheService = true;
  } catch (_) {}
  try {
    container.resolve('streamResolveCache');
    hasStreamResolveCache = true;
  } catch (_) {}

  testAssert('cacheService is completely removed from DI container', !hasCacheService);
  testAssert('streamResolveCache is completely removed from DI container', !hasStreamResolveCache);

  // ─── 1. Spin up instrumented mock upstream server ──────────────────────────
  const upstreamRequests = [];
  const mockServer = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const reqRecord = {
      method: req.method,
      path: url.pathname,
      headers: req.headers,
      timestamp: Date.now()
    };
    upstreamRequests.push(reqRecord);

    if (url.pathname === '/live/stream.m3u8') {
      res.writeHead(200, {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(
        '#EXTM3U\n' +
        '#EXT-X-VERSION:3\n' +
        '#EXT-X-TARGETDURATION:10\n' +
        '#EXTINF:10.0,\n' +
        'chunk_001.ts\n' +
        '#EXTINF:10.0,\n' +
        'chunk_002.ts\n'
      );
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  await new Promise((resolve) => mockServer.listen(0, '127.0.0.1', resolve));
  const mockPort = mockServer.address().port;
  const mockStreamUrl = `http://127.0.0.1:${mockPort}/live/stream.m3u8`;
  console.log(`[MockUpstream] Listening on http://127.0.0.1:${mockPort}\n`);

  try {
    // ─── 2. Setup Test Match Fixture ─────────────────────────────────────────
    const testMatchId = 'test_match_zero_cache_verification';
    const testMatch = {
      id: testMatchId,
      title: 'Real Madrid vs Barcelona (Zero Cache Test)',
      category: 'football',
      date: String(Date.now() - 1000 * 60 * 15), // Live
      popular: '1',
      sources: [
        {
          source: 'iptv-org',
          id: 'mock_source_1',
          quality: '1080p',
          url: mockStreamUrl,
          user_agent: 'NuvioTestClient/1.0',
          referrer: 'http://127.0.0.1/'
        }
      ]
    };

    // Wire mock matches into matchAggregator
    const matchAggregator = container.resolve('matchAggregator');
    const originalSyncMatches = matchAggregator.syncMatches.bind(matchAggregator);
    matchAggregator.syncMatches = async () => [testMatch];

    // ─── 3. Request 1: Initial Stream Fetch ──────────────────────────────────
    console.log('👉 Executing Stream Request 1 (Initial Fetch)...');
    upstreamRequests.length = 0; // reset counter

    const startTime1 = Date.now();
    const result1 = await handleStream('tv', `nuvio_sport_${testMatchId}`, {});
    const duration1 = Date.now() - startTime1;

    const hitsAfterReq1 = upstreamRequests.length;
    console.log(`   - Request 1 completed in ${duration1}ms`);
    console.log(`   - Streams returned: ${result1?.streams?.length || 0}`);
    console.log(`   - Upstream HTTP requests received: ${hitsAfterReq1}`);

    testAssert('Request 1 returns valid streams array', Array.isArray(result1?.streams) && result1.streams.length > 0);
    testAssert('Request 1 contacts upstream server (Hits == 1)', hitsAfterReq1 === 1, `Hits: ${hitsAfterReq1}`);
    testAssert('Request 1 returned cacheMaxAge == 0', result1?.cacheMaxAge === 0);

    // ─── 4. Request 2: Successive Stream Fetch ───────────────────────────────
    console.log('\n👉 Executing Stream Request 2 (Successive Fetch)...');
    const startTime2 = Date.now();
    const result2 = await handleStream('tv', `nuvio_sport_${testMatchId}`, {});
    const duration2 = Date.now() - startTime2;

    const hitsAfterReq2 = upstreamRequests.length;
    const freshHitsOnReq2 = hitsAfterReq2 - hitsAfterReq1;
    console.log(`   - Request 2 completed in ${duration2}ms`);
    console.log(`   - Streams returned: ${result2?.streams?.length || 0}`);
    console.log(`   - Total upstream HTTP requests received: ${hitsAfterReq2}`);
    console.log(`   - Additional upstream requests made during Request 2: ${freshHitsOnReq2}`);

    testAssert('Request 2 returns valid streams array', Array.isArray(result2?.streams) && result2.streams.length > 0);
    testAssert(
      'Request 2 contacts upstream server (Total Hits == 2, Fresh Hits == 1)',
      hitsAfterReq2 === 2 && freshHitsOnReq2 === 1,
      `Total Hits: ${hitsAfterReq2}, Fresh on Req 2: ${freshHitsOnReq2}`
    );
    testAssert('Request 2 returned cacheMaxAge == 0', result2?.cacheMaxAge === 0);

    // ─── 5. Cache Hit Rate Calculation ───────────────────────────────────────
    console.log('\n👉 Verifying 0% Cache Hit Rate...');
    const cacheHits = hitsAfterReq2 === 1 ? 1 : 0;
    const totalRequests = 2;
    const cacheHitPercentage = (cacheHits / totalRequests) * 100;

    testAssert(
      'Cache Hit Rate is exactly 0.00% (Upstream hit on 100% of requests)',
      hitsAfterReq2 === 2,
      `Cache hit rate: ${cacheHitPercentage.toFixed(2)}%`
    );

    // Restore original matchAggregator
    matchAggregator.syncMatches = originalSyncMatches;

    // ─── Summary ────────────────────────────────────────────────────────────
    console.log('\n================================================================');
    console.log(`🎯 Test Summary: ${passed} Passed, ${failed} Failed`);
    console.log('================================================================\n');

    if (failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await new Promise((resolve) => mockServer.close(resolve));
    console.log('[MockUpstream] Server closed cleanly.');
  }
}

if (require.main === module) {
  runZeroCacheVerification().catch((err) => {
    console.error('Test execution failed with error:', err);
    process.exit(1);
  });
}

module.exports = { runZeroCacheVerification };
