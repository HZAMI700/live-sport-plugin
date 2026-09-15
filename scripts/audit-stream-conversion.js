#!/usr/bin/env node
/**
 * scripts/audit-stream-conversion.js — DIAGNOSTIC AUDIT (read-only)
 *
 * Purpose: answer "are all streams converted to direct streams?" against the
 * REAL live catalog. No mocks, no source fixes, no HTTP server.
 *
 * Flow:
 *   1. Init the awilix DI container (src/container) like scripts/test-e2e-caching.js.
 *   2. Force a REAL catalog refresh: cronService.runSync() → MatchAggregator.syncMatches()
 *      (network expected — providers fetch live).
 *   3. For each match (live-first, optional --limit N, hard budget default 8 min,
 *      self-truncates and reports coverage): handleStream('tv','nuvio_sport_'+id, {})
 *      with NO config → selectSources() default path.
 *   4. Classify every returned stream:
 *        label    ⚡ Direct Stream / 🌐 Web Stream (s.name)
 *        urlClass direct-m3u8 | proxied-m3u8 (/api/manifest|/api/hls) | web-player (externalUrl|/watch?|no url) | other
 *        mismatch ⚡ label but urlClass is NOT direct/proxied-m3u8  ← smoking gun
 *   5. Per-source yield: selectSources is NOT exported (verified at runtime), so the
 *      attempted set is reconstructed from resolveCache.entries: for each src in
 *      match.sources the key `${src.source}:${matchId}:${src.id}` has status
 *      'ok' | 'failed' | absent(=filtered by selectSources / never attempted).
 *   6. resolveCache.stats() before + after (hits/misses/negativeHits/evictions/learnedTtls).
 *   7. Artifacts in scratch/e2e-audit/: audit-results.json, stream-audit.md, run-output.log
 *
 * Run (from repo root):  node scripts/audit-stream-conversion.js [--limit N] [--budget-min M] [--match-cap MS]
 */

const fs = require('fs');
const path = require('path');
const { format } = require('util');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'scratch', 'e2e-audit');
fs.mkdirSync(OUT_DIR, { recursive: true });

// ─── CLI args ────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const argVal = (flag, def) => {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] !== undefined ? argv[i + 1] : def;
};
const LIMIT = parseInt(argVal('--limit', '0'), 10) || 0;            // 0 = all
const BUDGET_MS = Math.max(1, parseFloat(argVal('--budget-min', '8'))) * 60 * 1000; // hard global budget
const MATCH_CAP_MS = Math.max(10_000, parseInt(argVal('--match-cap', '120000'), 10) || 120_000); // per-match race cap
const HARD_DEADLINE = Date.now() + BUDGET_MS;
const STARTED_AT = new Date();

const ARTIFACT_JSON = path.join(OUT_DIR, 'audit-results.json');
const ARTIFACT_MD = path.join(OUT_DIR, 'stream-audit.md');
const ARTIFACT_LOG = path.join(OUT_DIR, 'run-output.log');

// ─── Console tee → run-output.log (before requiring the container so all provider
//     logs are captured). Synchronous appends so process.exit() can't drop lines. ──
const origLog = console.log.bind(console);
const origWarn = console.warn.bind(console);
const origError = console.error.bind(console);
const logLine = (level, args) => {
  const line = args.map((a) => (typeof a === 'string' ? a : format(a))).join(' ');
  try { fs.appendFileSync(ARTIFACT_LOG, `[${level}] ${new Date().toISOString()} ${line}\n`); } catch (_) {}
};
console.log = (...a) => { origLog(...a); logLine('log', a); };
console.warn = (...a) => { origWarn(...a); logLine('warn', a); };
console.error = (...a) => { origError(...a); logLine('error', a); };

// Provider error signal: resolveSource() catches and console.warn's
// "[streams.js] Error resolving <source> for <id>: <msg>" — tally by source name.
const providerErrorCounts = {};
console.warn = (...a) => {
  origWarn(...a); logLine('warn', a);
  const first = typeof a[0] === 'string' ? a[0] : '';
  const m = first.match(/\[streams\.js\] Error resolving (\S+) for/);
  if (m) providerErrorCounts[m[1]] = (providerErrorCounts[m[1]] || 0) + 1;
};
const syncErrors = []; // raw "[MatchAggregator] Provider N failed" lines
console.error = (...a) => {
  origError(...a); logLine('error', a);
  const first = typeof a[0] === 'string' ? a[0] : '';
  if (first.includes('[MatchAggregator] Provider') || first.includes('Provider fetch failed')) {
    syncErrors.push(a.map((x) => (typeof x === 'string' ? x : format(x))).join(' '));
  }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const truncate = (s, n) => { const str = String(s || ''); return str.length > n ? str.slice(0, n - 1) + '…' : str; };
const remainingMs = () => HARD_DEADLINE - Date.now();

// ─── Stream classification (spec from task) ───────────────────────────────────
function classifyStream(s) {
  if (!s) return 'other';
  const url = s.url || '';
  if (s.externalUrl || url.includes('/watch?') || !url) return 'web-player';
  if (url.includes('.m3u8')) {
    return (url.includes('/api/manifest') || url.includes('/api/hls')) ? 'proxied-m3u8' : 'direct-m3u8';
  }
  return 'other';
}

const URL_CLASSES = ['direct-m3u8', 'proxied-m3u8', 'web-player', 'other'];

async function main() {
  console.log('====================================================');
  console.log('🔎 Stream Conversion Audit — DIAGNOSTIC ONLY (no fixes, no server)');
  console.log('====================================================');
  console.log(`node: ${process.version} | args: ${argv.join(' ') || '(none)'}`);
  console.log(`budget: ${BUDGET_MS / 1000}s hard | per-match cap: ${MATCH_CAP_MS}ms | limit: ${LIMIT || 'all'}`);
  console.log(`artifacts dir: ${OUT_DIR}\n`);

  // 1) DI container — same as scripts/test-e2e-caching.js, NO mocks.
  const container = require(path.join(ROOT, 'src', 'container'));
  const { handleStream } = require(path.join(ROOT, 'src', 'streams'));
  const { isMatchLive } = require(path.join(ROOT, 'src', 'catalog'));

  // selectSources() is internal to streams.js — verify the export assumption.
  const streamsModule = require(path.join(ROOT, 'src', 'streams'));
  const selectSourcesExported = typeof streamsModule.selectSources === 'function';
  console.log(`[audit] selectSources exported from src/streams.js? ${selectSourcesExported ? 'YES' : 'NO (per-source yield reconstructed from resolveCache.entries)'}`);

  const resolveCache = container.resolve('streamResolveCache');
  const cacheService = container.resolve('cacheService');

  // 2) Load the REAL live match catalog (network expected).
  console.log('\n[audit] Syncing real catalog: cronService.runSync() → MatchAggregator.syncMatches() (network)...');
  const cronService = container.resolve('cronService');
  const syncStart = Date.now();
  try {
    await Promise.race([
      cronService.runSync(),
      sleep(150_000).then(() => { throw new Error('catalog-sync-timeout'); })
    ]);
    console.log(`[audit] catalog sync done in ${Date.now() - syncStart}ms`);
  } catch (e) {
    console.error('[audit] catalog sync failed/timeout:', e.message);
  }

  const allMatches = cacheService.getMatches();
  console.log(`[audit] cacheService.getMatches() returned ${allMatches.length} matches`);

  // Order like handleCatalog: live first, fixtures before 24/7 networks, then
  // popular, then closest kickoff — so a truncated run covers what users actually
  // click on the "live" row rather than burning the budget on network channels.
  const ordered = [...allMatches]
    .filter((m, idx) => allMatches.findIndex((x) => x.id === m.id) === idx) // dedupe by id
    .sort((a, b) => {
      const la = isMatchLive(a) ? 1 : 0, lb = isMatchLive(b) ? 1 : 0;
      if (la !== lb) return lb - la;
      const ea = a.category !== 'networks' ? 1 : 0, eb = b.category !== 'networks' ? 1 : 0;
      if (ea !== eb) return eb - ea;
      const pa = a.popular === '1' ? 1 : 0, pb = b.popular === '1' ? 1 : 0;
      if (pa !== pb) return pb - pa;
      const da = parseInt(a.date, 10) || 0, db = parseInt(b.date, 10) || 0;
      return da - db;
    });
  const liveCount = ordered.filter((m) => isMatchLive(m)).length;
  const matchesToProcess = LIMIT > 0 ? ordered.slice(0, LIMIT) : ordered;
  console.log(`[audit] processing ${matchesToProcess.length} matches (${liveCount} live of ${ordered.length} total catalog)\n`);

  const statsBefore = resolveCache.stats();

  // ─── Per-match + global accumulation ─────────────────────────────────────────
  const matchResults = [];
  const providerTally = {}; // source -> { ok, failed, absent, yielded, attempted }
  const urlClassTotals = { 'direct-m3u8': 0, 'proxied-m3u8': 0, 'web-player': 0, 'other': 0 };
  let streamsTotal = 0, mismatchCount = 0, matchErrors = 0, matchTimeouts = 0, processed = 0, truncated = false;
  const channelInjectedTotal = { total: 0, matches: 0 };
  const M = matchesToProcess.length;

  for (const [idx, m] of matchesToProcess.entries()) {
    if (remainingMs() < 20_000) {
      console.log(`[audit] ⏰ BUDGET EXHAUSTED at ${Math.round(remainingMs() / 1000)}s remaining after ${processed}/${M} matches — truncating run.`);
      truncated = true;
      break;
    }
    processed++;
    const matchId = String(m.id);
    const matchStart = Date.now();
    const sources = Array.isArray(m.sources) ? m.sources : [];
    const srcOccurrences = new Map(); // `${source}:${id}` -> { source, id, count }
    for (const src of sources) {
      if (!src || src.source == null || src.id == null) continue;
      const sk = `${src.source}:${src.id}`;
      const prev = srcOccurrences.get(sk);
      srcOccurrences.set(sk, prev ? { ...prev, count: prev.count + 1 } : { source: src.source, id: src.id, count: 1 });
    }

    console.log(`[audit] [${idx + 1}/${M}] ${truncate(m.title, 70)} (${m.category}) — ${srcOccurrences.size} source(s)…`);

    // 3) handleStream with NO config ({} → selectSources default path — bug A live).
    const idKey = `nuvio_sport_${matchId}`;
    let res, matchStatus;
    let timer;
    const capMs = Math.max(10_000, Math.min(MATCH_CAP_MS, remainingMs() - 10_000));
    try {
      res = await Promise.race([
        handleStream('tv', idKey, {}),
        new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('match-timeout')), capMs); })
      ]);
      matchStatus = 'ok';
    } catch (e) {
      if (e.message === 'match-timeout') { matchStatus = 'timeout'; matchTimeouts++; res = { streams: [] }; }
      else { matchStatus = 'error'; matchErrors++; res = { streams: [] }; }
    } finally { clearTimeout(timer); }

    const durMs = Date.now() - matchStart;
    const streams = (res && Array.isArray(res.streams)) ? res.streams : [];

    // Snapshot entry statuses immediately after the match's mints settle.
    const perMatch = {
      id: matchId, title: m.title, category: m.category, live: isMatchLive(m),
      status: matchStatus, durationMs: durMs, sourcesInMatch: srcOccurrences.size,
      sourceStatuses: {}, filteredSources: [], urlClassCounts: { 'direct-m3u8': 0, 'proxied-m3u8': 0, 'web-player': 0, 'other': 0 },
      mismatchCount: 0, channelInjected: 0, streams: []
    };

    // 4) Per-source yield: status of resolveCache.entries.get(key) per src.
    for (const [sk, info] of srcOccurrences) {
      const key = `${info.source}:${matchId}:${info.id}`;
      const st = resolveCache.entries.get(key)?.status || 'absent'; // absent = filtered by selectSources / never attempted
      perMatch.sourceStatuses[sk] = st;
      if (st === 'absent') perMatch.filteredSources.push(sk);
      const p = providerTally[info.source] || (providerTally[info.source] = { attempted: 0, ok: 0, failed: 0, absent: 0, yielded: 0 });
      p[st] = (p[st] || 0) + 1;
      if (st !== 'absent') p.attempted++;
    }

    // 4b) Classify returned streams.
    for (const s of streams) {
      const urlClass = classifyStream(s);
      const label = s.name || '(no label)';
      const mismatch = label === '⚡ Direct Stream' && urlClass !== 'direct-m3u8' && urlClass !== 'proxied-m3u8';
      const source = s._source || (s._cacheKey ? String(s._cacheKey).split(':')[0] : 'unknown');
      const isChannel = s._cacheKey && String(s._cacheKey).includes(':__channel__:');

      perMatch.urlClassCounts[urlClass]++;
      urlClassTotals[urlClass]++;
      streamsTotal++;
      if (mismatch) { mismatchCount++; perMatch.mismatchCount++; }
      if (isChannel) { perMatch.channelInjected++; }

      const p = providerTally[source] || (providerTally[source] = { attempted: 0, ok: 0, failed: 0, absent: 0, yielded: 0 });
      p.yielded++;

      perMatch.streams.push({
        label, urlClass, mismatch, source, cacheKey: s._cacheKey || null,
        url: truncate(s.url || '', 160), externalUrl: truncate(s.externalUrl || '', 160),
        title: truncate((s.title || '').split('\n')[0], 120)
      });
    }

    if (perMatch.channelInjected > 0) { channelInjectedTotal.total += perMatch.channelInjected; channelInjectedTotal.matches++; }
    matchResults.push(perMatch);

    const flag = matchStatus !== 'ok' ? ` ⚠️ ${matchStatus}` : (perMatch.mismatchCount ? ' ⚠️ mismatches=' + perMatch.mismatchCount : '');
    console.log(`  → ${durMs}ms | ${streams.length} stream(s) | D=${perMatch.urlClassCounts['direct-m3u8']} P=${perMatch.urlClassCounts['proxied-m3u8']} W=${perMatch.urlClassCounts['web-player']} O=${perMatch.urlClassCounts.other}${flag}`);
  }

  const statsAfter = resolveCache.stats();
  const durationMs = Date.now() - STARTED_AT.getTime();

  // Zero-yield providers: attempted at least once but yielded 0 final streams.
  const zeroYieldProviders = Object.entries(providerTally)
    .filter(([, p]) => p.attempted > 0 && p.yielded === 0)
    .map(([name]) => name);
  const erroringProviders = Object.entries(providerErrorCounts).map(([name, n]) => ({ name, errors: n }));
  const embedIndiaAbsent = matchResults.reduce((acc, rm) => {
    const keys = Object.keys(rm.sourceStatuses).filter((k) => k.startsWith('embedindia:'));
    const absent = keys.filter((k) => rm.sourceStatuses[k] === 'absent').length;
    return acc + absent;
  }, 0);
  const embedIndiaInCatalog = matchResults.reduce((acc, rm) => acc + Object.keys(rm.sourceStatuses).filter((k) => k.startsWith('embedindia:')).length, 0);

  // ─── Artifact 1: machine-readable JSON ───────────────────────────────────────
  const auditResults = {
    meta: {
      tool: 'scripts/audit-stream-conversion.js (diagnostic only)',
      node: process.version,
      args: argv,
      startedAt: STARTED_AT.toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs,
      budgetMs: BUDGET_MS,
      perMatchCapMs: MATCH_CAP_MS,
      truncated,
      limit: LIMIT,
      matchesRequested: matchesToProcess.length,
      matchesProcessed: processed,
      matchTimeouts,
      matchErrors,
      selectSourcesExported,
      selectSourcesNote: 'selectSources is NOT exported from src/streams.js; attempted set reconstructed from resolveCache.entries (absent = filtered/never attempted)',
      catalog: { total: ordered.length, live: liveCount, inRun: matchesToProcess.length },
      statsBefore,
      statsAfter,
      embedIndia: { inCatalogMatches: embedIndiaInCatalog, filteredAbsent: embedIndiaAbsent }
    },
    totals: { streams: streamsTotal, mismatchCount, urlClassTotals, channelInjected: channelInjectedTotal },
    providerTally,
    providerErrorCounts,
    zeroYieldProviders,
    erroringProviders,
    syncErrors,
    matches: matchResults
  };
  fs.writeFileSync(ARTIFACT_JSON, JSON.stringify(auditResults, null, 2));

  // ─── Artifact 2: human-readable markdown ─────────────────────────────────────
  const md = [];
  md.push('# Stream Conversion Audit — scratch/e2e-audit', '');
  md.push('> DIAGNOSTIC ONLY — no source files modified, no server started. Run by `node scripts/audit-stream-conversion.js`.', '');
  md.push(`**Run:** ${STARTED_AT.toISOString()} → ${new Date().toISOString()} (${Math.round(durationMs / 1000)}s)  `);
  md.push(`**Node:** ${process.version} | **Args:** \`${argv.join(' ') || '(none)'}\``);
  md.push(`**Truncated by budget:** ${truncated ? 'YES (8-min hard budget)' : 'no'} | **Matches requested/processed:** ${matchesToProcess.length}/${processed}  `);
  md.push(`**selectSources exported:** ${selectSourcesExported} — per-source yield reconstructed from \`resolveCache.entries\` (absent = filtered by selectSources default path / never attempted).`, '');
  md.push('## Summary', '');
  md.push(`| Metric | Value |`);
  md.push(`|---|---|`);
  md.push(`| Matches processed | ${processed} |`);
  md.push(`| Total streams returned | ${streamsTotal} |`);
  md.push(`| direct-m3u8 | ${urlClassTotals['direct-m3u8']} |`);
  md.push(`| proxied-m3u8 (/api/manifest\|/api/hls) | ${urlClassTotals['proxied-m3u8']} |`);
  md.push(`| web-player (externalUrl\|/watch?\|no url) | ${urlClassTotals['web-player']} |`);
  md.push(`| other | ${urlClassTotals.other} |`);
  md.push(`| **MISMATCH (⚡ label but non-m3u8 urlClass)** | **${mismatchCount}** |`);
  md.push(`| 24/7 cricket channels injected | ${channelInjectedTotal.total} (in ${channelInjectedTotal.matches} matches) |`);
  md.push(`| embedindia sources in catalog / filtered as absent | ${embedIndiaInCatalog} / ${embedIndiaAbsent} |`, '');

  md.push('## Per-match table', '');
  md.push('| id | title | cat | live | srcs | streams | D | P | W | O | mm | status |');
  md.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const rm of matchResults) {
    md.push(`| ${rm.id} | ${truncate(rm.title, 44)} | ${rm.category} | ${rm.live ? '🟢' : ''} | ${rm.sourcesInMatch} | ${rm.streams.length} | ${rm.urlClassCounts['direct-m3u8']} | ${rm.urlClassCounts['proxied-m3u8']} | ${rm.urlClassCounts['web-player']} | ${rm.urlClassCounts.other} | ${rm.mismatchCount} | ${rm.status} |`);
  }
  md.push('');

  md.push('## Mismatch list (⚡ Direct Stream label on non-m3u8 urlClass — the smoking gun)', '');
  const mismatches = matchResults.flatMap((rm) => rm.streams.filter((s) => s.mismatch).map((s) => ({ matchId: rm.id, title: rm.title, ...s })));
  if (mismatches.length === 0) {
    md.push('*None — every ⚡ Direct Stream carries a direct/proxied .m3u8 URL.*', '');
  } else {
    md.push('| match | provider | urlClass | label | url | externalUrl | title |');
    md.push('|---|---|---|---|---|---|---|');
    for (const s of mismatches) {
      md.push(`| ${s.matchId} | ${s.source} | ${s.urlClass} | ${s.label} | \`${truncate(s.url, 90)}\` | \`${truncate(s.externalUrl, 70)}\` | ${truncate(s.title, 60)} |`);
    }
  }
  md.push('');

  md.push('## Per-provider yield (attempted = cache entry present; absent = filtered/never attempted)', '');
  md.push('| source | attempted | ok | failed | absent | yielded streams | zero-yield | resolve errors |');
  md.push('|---|---|---|---|---|---|---|---|');
  for (const [name, p] of Object.entries(providerTally).sort((a, b) => b[1].attempted - a[1].attempted)) {
    const zero = p.attempted > 0 && p.yielded === 0 ? '⚠️ YES' : '';
    md.push(`| ${name} | ${p.attempted} | ${p.ok} | ${p.failed} | ${p.absent} | ${p.yielded} | ${zero} | ${providerErrorCounts[name] || 0} |`);
  }
  md.push('');

  md.push('## resolveCache.stats()', '');
  md.push('```json');
  md.push('BEFORE: ' + JSON.stringify(statsBefore));
  md.push('AFTER:  ' + JSON.stringify(statsAfter));
  md.push('```', '');

  if (syncErrors.length) {
    md.push('## Catalog sync errors', '');
    syncErrors.forEach((e) => md.push(`- \`${truncate(e, 200)}\``));
    md.push('');
  }

  md.push('## Diagnostics hooks (unchanged code, for reference only)', '');
  md.push('- Bug A (default selectSources path): `src/streams.js:30` — no-config `KNOWN_FALLBACKS` omits `embedindia`; the config path at `src/streams.js:19` includes it. Impact: EmbedIndia web players never selected without user config.');
  md.push('- Mismatch B (TTL floor expectation): `scripts/test-stream-resolve-cache.js:86` asserts floor 20s, but `src/services/StreamResolveCache.js:16` sets `MIN_TTL_MS = 60 * 1000` (floor applied at `:131`).');
  md.push('- Streamed.pk/embed.st: `src/providers/lock.wasm` extractor crashes (see error.log) → resolveStream throws → source cached as `failed`.');
  md.push('');
  fs.writeFileSync(ARTIFACT_MD, md.join('\n'));

  // ─── Compact stdout summary ──────────────────────────────────────────────────
  console.log('\n====================================================');
  console.log('📋 AUDIT SUMMARY');
  console.log('====================================================');
  console.log(`matches processed: ${processed}/${matchesToProcess.length} (${truncated ? 'truncated by budget' : 'complete'}) — catalog had ${ordered.length} (${liveCount} live)`);
  console.log(`total streams: ${streamsTotal}`);
  console.log(`per-urlClass: direct-m3u8=${urlClassTotals['direct-m3u8']} proxied-m3u8=${urlClassTotals['proxied-m3u8']} web-player=${urlClassTotals['web-player']} other=${urlClassTotals.other}`);
  console.log(`mismatch count (⚡ label, non-m3u8 urlClass): ${mismatchCount}`);
  console.log(`zero-yield providers (attempted>0, yielded=0): ${zeroYieldProviders.length ? zeroYieldProviders.join(', ') : 'none'}`);
  console.log(`erroring providers (resolve errors): ${erroringProviders.length ? erroringProviders.map((e) => `${e.name}(${e.errors})`).join(', ') : 'none'}`);
  console.log(`match timeouts: ${matchTimeouts} | match errors: ${matchErrors}`);
  console.log(`stats: entries ${statsBefore.entries}→${statsAfter.entries} | hits ${statsBefore.hits}→${statsAfter.hits} | misses ${statsBefore.misses}→${statsAfter.misses} | negativeHits ${statsBefore.negativeHits}→${statsAfter.negativeHits} | evictions ${statsBefore.evictions}→${statsAfter.evictions}`);
  console.log('----------------------------------------------------');
  console.log('ARTIFACTS:');
  console.log(`  ${ARTIFACT_JSON}`);
  console.log(`  ${ARTIFACT_MD}`);
  console.log(`  ${ARTIFACT_LOG}`);
  console.log('====================================================');

  await sleep(400); // let stdout flush before exit
  process.exit(0);
}

main().catch((err) => {
  console.error('[audit] FATAL:', err);
  process.exit(1);
});
