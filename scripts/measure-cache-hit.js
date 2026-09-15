#!/usr/bin/env node
/**
 * scripts/measure-cache-hit.js — Cache behavior measured with NUMBERS (live)
 *
 * Complements scripts/test-e2e-caching.js (fully mocked) with a real-catalog
 * double-call measurement of the StreamResolveCache pipeline:
 *   1. Real catalog via cacheService.getMatches() (refresh if empty).
 *   2. Pick the first match with >=1 selectable source.
 *   3. handleStream() twice back-to-back with NO config (default selectSources path).
 *   4. Record per call: wall time, resolveCache.stats() deltas (hits/misses/
 *      negativeHits), stream counts, per-entry cache status.
 *
 * Expected: call 1 = cold mint (misses += N, slow, seconds); call 2 = served
 * from cache (hits += N, milliseconds) unless entries expired/negative-cached.
 *
 * Run: node scripts/measure-cache-hit.js   (~60s budget)
 */

const path = require('path');
const ROOT = path.join(__dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const container = require(path.join(ROOT, 'src', 'container'));
  const { handleStream } = require(path.join(ROOT, 'src', 'streams'));
  const cacheService = container.resolve('cacheService');
  const resolveCache = container.resolve('streamResolveCache');
  const cronService = container.resolve('cronService');

  let matches = cacheService.getMatches();
  if (!matches || matches.length === 0) {
    console.log('[measure] catalog empty — syncing real catalog (network)...');
    await Promise.race([cronService.runSync(), sleep(45000)]);
    matches = cacheService.getMatches();
  }
  console.log(`[measure] catalog size: ${matches.length} matches`);

  // Prefer a match with a couple of sources so both mint and hit paths show
  const match = matches.find((m) => m.sources && m.sources.length >= 1);
  if (!match) { console.error('[measure] no match with sources found'); process.exit(1); }
  console.log(`[measure] target match: ${match.id} "${match.title}" (${match.category}), sources: [${match.sources.map((s) => s.source).join(', ')}]`);

  resolveCache.statsCounters = { hits: 0, misses: 0, negativeHits: 0, evictions: 0 };

  const t1 = Date.now();
  const r1 = await handleStream('tv', 'nuvio_sport_' + match.id, {});
  const d1 = Date.now() - t1;
  const s1 = resolveCache.stats();
  console.log(`\n=== CALL 1 (cold) ===`);
  console.log(`  wall=${d1}ms  streams=${r1.streams.length}`);
  console.log(`  stats.after: ${JSON.stringify({ hits: s1.hits, misses: s1.misses, negativeHits: s1.negativeHits })}`);

  const t2 = Date.now();
  const r2 = await handleStream('tv', 'nuvio_sport_' + match.id, {});
  const d2 = Date.now() - t2;
  const s2 = resolveCache.stats();
  console.log(`\n=== CALL 2 (warm) ===`);
  console.log(`  wall=${d2}ms  streams=${r2.streams.length}`);
  console.log(`  stats.after: ${JSON.stringify({ hits: s2.hits, misses: s2.misses, negativeHits: s2.negativeHits, evictions: s2.evictions })}`);
  console.log(`  learnedTtls: ${JSON.stringify(s2.learnedTtls)}`);

  // Per-entry status snapshot for this match's keys
  const keys = match.sources.map((src) => `${src.source}:${match.id}:${src.id}`);
  console.log(`\n=== per-source cache entries ===`);
  for (const k of keys) {
    const e = resolveCache.entries.get(k);
    console.log(`  ${k}: ${e ? e.status : 'ABSENT (filtered/never minted)'}${e ? `, expires_in=${Math.round(e.expiresAt - Date.now())}ms` : ''}`);
  }

  const hitSpeedup = d1 / Math.max(d2, 1);
  console.log(`\n=== VERDICT ===`);
  console.log(`  call1 (cold mint) ${d1}ms → call2 (warm) ${d2}ms | speedup ${hitSpeedup.toFixed(1)}x`);
  console.log(`  hits recorded on call2: ${s2.hits - s1.hits} | misses recorded on call1: ${s1.misses}`);
  console.log(`  cacheHitPathWorks: ${s2.hits > 0 && d2 < d1 ? 'PASS' : 'CHECK (entries may have expired: TTL min 60s)'}`);

  setTimeout(() => process.exit(0), 100).unref?.();
}

main().catch((e) => { console.error('measure fatal:', e); process.exit(1); });
