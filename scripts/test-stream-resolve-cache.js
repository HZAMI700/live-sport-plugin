/**
 * Unit tests for StreamResolveCache — run: node scripts/test-stream-resolve-cache.js
 * Plain node, no test framework required.
 */
const StreamResolveCache = require('../src/services/StreamResolveCache');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  let pass = 0, fail = 0;
  const t = (name, cond) => {
    if (cond) { pass++; console.log('  PASS ' + name); }
    else { fail++; console.log('  FAIL ' + name); }
  };

  {
    const c = new StreamResolveCache();
    const out = await c.getOrCreate('src1:m1:s1', async () => [{ url: 'http://x/y.m3u8', title: 'A' }]);
    t('mints and returns streams', Array.isArray(out) && out[0].url === 'http://x/y.m3u8');
  }

  {
    const c = new StreamResolveCache();
    let calls = 0;
    const mint = async () => { calls++; return [{ url: 'u' }]; };
    await c.getOrCreate('src1:m1:s1', mint);
    await c.getOrCreate('src1:m1:s1', mint);
    await c.getOrCreate('src1:m1:s1', mint);
    const st = c.stats();
    t('hit avoids re-mint (calls=1)', calls === 1);
    t('hit counters recorded', st.hits === 2 && st.misses === 1);
  }

  {
    const c = new StreamResolveCache();
    await c.getOrCreate('src2:m1:s1', async () => [{ url: 'u', title: 'orig' }]);
    const a = await c.getOrCreate('src2:m1:s1', async () => [{ url: 'u', title: 'poison' }]);
    a[0].title = 'mutated';
    a.push({ url: 'extra' });
    const b = await c.getOrCreate('src2:m1:s1', async () => []);
    t('clone-on-read protects cache', b.length === 1 && b[0].title === 'orig' && b[0].url === 'u');
  }

  {
    const c = new StreamResolveCache();
    let calls = 0;
    const mint = async () => { calls++; await sleep(40); return [{ url: 'u' }]; };
    const [a, b, d] = await Promise.all([
      c.getOrCreate('src3:m1:s1', mint),
      c.getOrCreate('src3:m1:s1', mint),
      c.getOrCreate('src3:m1:s1', mint)
    ]);
    t('single-flight: one mint for 3 callers', calls === 1);
    t('single-flight: independent arrays', a !== b && b !== d && a !== d);
  }

  {
    const c = new StreamResolveCache();
    let calls = 0;
    const mint = async () => { calls++; return [{ url: 'u' }]; };
    await c.getOrCreate('src4:m1:s1', mint);
    c.entries.get('src4:m1:s1').expiresAt = Date.now() - 1;
    await c.getOrCreate('src4:m1:s1', mint);
    t('expired entry re-mints', calls === 2);
  }

  {
    const c = new StreamResolveCache({ negativeTtlMs: 80 });
    let calls = 0;
    const boom = async () => { calls++; throw new Error('provider down'); };
    const first = await c.getOrCreate('src5:m1:s1', boom);
    t('mint failure resolves to [] (never rejects)', calls === 1 && Array.isArray(first) && first.length === 0);
    const second = await c.getOrCreate('src5:m1:s1', boom);
    t('negative window returns [] without re-mint', calls === 1 && second.length === 0 && c.stats().negativeHits === 1);
    await sleep(100);
    await c.getOrCreate('src5:m1:s1', boom);
    t('negative expires and re-attempts', calls === 2);
  }

  {
    const c = new StreamResolveCache();
    c.noteSuccess('src6'); c.noteSuccess('src6'); c.noteSuccess('src6');
    t('success doubles TTL (480s after 3 doublings)', c.stats().learnedTtls.src6 === 480 * 1000);
    c.noteFailure('src6');
    t('failure halves TTL (240s)', c.stats().learnedTtls.src6 === 240 * 1000);
    for (let i = 0; i < 10; i++) c.noteFailure('src6');
    t('TTL floors at 20s', c.stats().learnedTtls.src6 === 20 * 1000);
    await c.getOrCreate('src6:mX:s1', async () => [{ url: 'u' }]);
    c.noteFailure('src6:mX:s1');
    t('failure evicts the match entry', c.stats().entries === 0);
  }

  {
    const c = new StreamResolveCache();
    await c.getOrCreate('src7:m1:s1', async () => [{ url: 'u' }]);
    await c.getOrCreate('src8:__channel__:willow', async () => [{ url: 'u' }]);
    c.pruneEnded(new Set(['m2']));
    t('pruneEnded drops ended match, keeps __channel__', c.stats().entries === 1);
  }

  {
    const c = new StreamResolveCache({ maxEntries: 3 });
    for (let i = 0; i < 5; i++) {
      await c.getOrCreate('src9:m' + i + ':s1', async () => [{ url: 'u' }]);
      await sleep(2);
    }
    const st = c.stats();
    t('LRU caps entries at 3', st.entries === 3 && st.evictions === 2);
  }

  console.log('\n' + (fail === 0 ? 'ALL TESTS PASSED' : 'TESTS FAILED') + ` (${pass} passed, ${fail} failed)`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(err => { console.error('test harness error:', err); process.exit(1); });
