const http = require('http');
const child_process = require('child_process');

async function runTest() {
  const upstreamPort = 9091;
  let currentTargetDuration = 1;
  let requestCount = 0;

  const upstream = http.createServer((req, res) => {
    requestCount++;
    res.writeHead(200, { 'Content-Type': 'application/vnd.apple.mpegurl' });
    res.end(`#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:${currentTargetDuration}\n#EXTINF:1.0,\nchunk.ts\n`);
  });

  await new Promise(resolve => upstream.listen(upstreamPort, resolve));
  console.log(`[TEST] Mock upstream listening on ${upstreamPort}`);

  const pluginPort = 9092;
  const env = { ...process.env, PORT: pluginPort, RESOLVER_PORT: 9093, LOW_MEMORY_MODE: 'true' };
  const plugin = child_process.spawn('node', ['src/index.js'], { env, stdio: 'inherit' });

  // Wait for the plugin to start
  console.log('[TEST] Waiting for plugin to start...');
  await new Promise(resolve => setTimeout(resolve, 4000));

  try {
    // ─── Test 1: 1s Target Duration ──────────────────────────────────────────────
    currentTargetDuration = 1;
    console.log('\n[TEST] --- Testing 1s Target Duration ---');
    const url1 = `http://localhost:${upstreamPort}/test1.m3u8`;
    
    let req1_1 = await fetch(`http://localhost:${pluginPort}/api/manifest?url=${encodeURIComponent(url1)}`);
    console.log(`[TEST] Req 1.1 Cache: ${req1_1.headers.get('x-manifest-cache')} (Expected: MISS)`);
    if (req1_1.headers.get('x-manifest-cache') !== 'MISS') throw new Error('Expected MISS on first request');

    let req1_2 = await fetch(`http://localhost:${pluginPort}/api/manifest?url=${encodeURIComponent(url1)}`);
    console.log(`[TEST] Req 1.2 Cache: ${req1_2.headers.get('x-manifest-cache')} (Expected: HIT)`);
    if (req1_2.headers.get('x-manifest-cache') !== 'HIT') throw new Error('Expected HIT on immediate second request');

    console.log('[TEST] Waiting 0.6 seconds (Simulating early poll)...');
    await new Promise(resolve => setTimeout(resolve, 600));

    let req1_3 = await fetch(`http://localhost:${pluginPort}/api/manifest?url=${encodeURIComponent(url1)}`);
    console.log(`[TEST] Req 1.3 Cache: ${req1_3.headers.get('x-manifest-cache')} (Expected: MISS)`);
    if (req1_3.headers.get('x-manifest-cache') !== 'MISS') throw new Error('Expected MISS after 0.6s on 1s stream (prevents stall)');


    // ─── Test 2: 2s Target Duration ──────────────────────────────────────────────
    currentTargetDuration = 2;
    console.log('\n[TEST] --- Testing 2s Target Duration ---');
    const url2 = `http://localhost:${upstreamPort}/test2.m3u8`;

    let req2_1 = await fetch(`http://localhost:${pluginPort}/api/manifest?url=${encodeURIComponent(url2)}`);
    console.log(`[TEST] Req 2.1 Cache: ${req2_1.headers.get('x-manifest-cache')} (Expected: MISS)`);
    if (req2_1.headers.get('x-manifest-cache') !== 'MISS') throw new Error('Expected MISS on first request');

    console.log('[TEST] Waiting 0.5 seconds...');
    await new Promise(resolve => setTimeout(resolve, 500));

    let req2_2 = await fetch(`http://localhost:${pluginPort}/api/manifest?url=${encodeURIComponent(url2)}`);
    console.log(`[TEST] Req 2.2 Cache: ${req2_2.headers.get('x-manifest-cache')} (Expected: HIT)`);
    if (req2_2.headers.get('x-manifest-cache') !== 'HIT') throw new Error('Expected HIT after 0.5s on 2s stream');

    console.log('[TEST] Waiting 0.7 seconds (Total 1.2s)...');
    await new Promise(resolve => setTimeout(resolve, 700));

    let req2_3 = await fetch(`http://localhost:${pluginPort}/api/manifest?url=${encodeURIComponent(url2)}`);
    console.log(`[TEST] Req 2.3 Cache: ${req2_3.headers.get('x-manifest-cache')} (Expected: MISS)`);
    if (req2_3.headers.get('x-manifest-cache') !== 'MISS') throw new Error('Expected MISS after 1.2s on 2s stream');


    console.log('\n[TEST] \u2705 All stress tests passed successfully!');
  } catch (err) {
    console.error('\n[TEST] \u274C Test failed:', err.message);
    process.exitCode = 1;
  } finally {
    plugin.kill();
    upstream.close();
  }
}

runTest();
