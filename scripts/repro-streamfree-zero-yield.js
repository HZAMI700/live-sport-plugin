#!/usr/bin/env node
/**
 * scripts/repro-streamfree-zero-yield.js — DIAGNOSTIC REPRO (read-only, live)
 *
 * Reproduces the StreamFree 0/13 zero-yield found by scripts/audit-stream-conversion.js:
 * the provider mints proxied m3u8 URLs fine, but the pre-flight (src/streams.js
 * verifyStreams) drops 100% of them (403 on cdn1.streamfree.top/live-cdn/...,
 * 404 on streamfree.top/live/...).
 *
 * This script answers ONE question with evidence: does the CDN reject the
 * Referer/Origin header pair that BOTH the pre-flight and the /api/manifest
 * proxy (src/index.js fetchUpstreamManifest) send? Header parity was verified:
 *   - verifyStreams (src/streams.js ~L110): UA + Referer + Origin(if referer)
 *   - fetchUpstreamManifest (src/index.js L204): UA + Referer + Origin
 * So a header-artifact finding means playback through our own proxy fails too.
 *
 * Variants per minted stream:
 *   (a) UA only                  (b) UA + Referer https://streamfree.top/
 *   (c) UA + Referer + Origin    (d) no headers at all
 *
 * Run (from repo root):  node scripts/repro-streamfree-zero-yield.js
 * Total budget ~90s. No files under src/ are touched.
 */

const path = require('path');
const ROOT = path.join(__dirname, '..');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36';
const REFERER = 'https://streamfree.top/';
const ORIGIN = 'https://streamfree.top';

async function fetchVariant(undici, url, label, headers) {
  const t0 = Date.now();
  try {
    const res = await undici(url, { headers, headersTimeout: 6000, bodyTimeout: 6000 });
    const text = await res.body.text();
    const isM3u8 = text.includes('#EXT');
    console.log(`  [${label}] status=${res.statusCode} bytes=${text.length} m3u8=${isM3u8} (${Date.now() - t0}ms)`);
    console.log(`    body[0..60]: ${JSON.stringify(text.slice(0, 60))}`);
    return { label, status: res.statusCode, m3u8: isM3u8 };
  } catch (e) {
    console.log(`  [${label}] ERROR (${Date.now() - t0}ms): ${e.message || e.cause?.message || e}`);
    return { label, error: String(e.message || e) };
  }
}

async function main() {
  // 1) DI container — same as scripts/test-e2e-caching.js (no server started)
  const container = require(path.join(ROOT, 'src', 'container'));
  const provider = container.resolve('streamFreeProvider');
  const cacheService = container.resolve('cacheService');
  const { request: undiciRequest } = require('undici');

  // 2) Pick source ids: the evergreen 'willow' channel + one live sf_ match source
  const targets = [{ id: 'willow', category: 'cricket', title: 'Willow TV' }];
  try {
    const matches = cacheService.getMatches();
    const sf = matches.find((m) => String(m.id).startsWith('sf_') && m.sources?.some((s) => s.source === 'streamfree'));
    if (sf) {
      const src = sf.sources.find((s) => s.source === 'streamfree');
      targets.push({ id: src.id, category: sf.category, title: sf.title });
    } else {
      console.log('[repro] no live sf_ match in cacheService (catalog not synced) — testing willow only');
    }
  } catch (_) { /* catalog not synced — fine */ }

  let allVariants = [];

  for (const t of targets) {
    console.log(`\n=== resolveStream(${t.id}, ${t.category}, ${t.title}) ===`);
    let streams;
    try {
      streams = await provider.resolveStream(t.id, t.category, t.title);
    } catch (e) {
      console.log(`  resolveStream threw: ${e.message}`);
      continue;
    }
    console.log(`  minted streams: ${streams.length}`);
    if (!streams.length) continue;

    const s = streams[0];
    console.log(`  label=${s.name} title=${JSON.stringify(s.title)}`);
    console.log(`  proxyUrl=${s.url}`);

    // Extract the true upstream URL from our /api/manifest proxy wrapper
    const u = new URL(s.url, 'http://localhost');
    const target = u.searchParams.get('url');
    const referer = u.searchParams.get('referer') || REFERER;
    const origin = u.searchParams.get('origin') || ORIGIN;
    console.log(`  target m3u8 = ${target}`);
    console.log(`  referer=${referer} origin=${origin}`);

    // Which URL-construction branch produced it? (see StreamFreeProvider.resolveStream)
    const branch = target.includes('/live-cdn/') && target.includes('cdn1.streamfree.top')
      ? 'server_domain (/live-cdn/)'
      : target.includes('/live-cdn/')
        ? 'serverName!=origin fallback (/live-cdn/)'
        : target.includes('/live/')
          ? 'origin default (/live/)'
          : 'external_url';
    console.log(`  construction branch: ${branch}`);

    // 3) Header variant matrix — this is the verdict
    console.log('  --- header variants against upstream CDN ---');
    const variants = [
      ['a: UA only', { 'User-Agent': UA }],
      ['b: UA+Referer', { 'User-Agent': UA, Referer: referer }],
      ['c: UA+Referer+Origin', { 'User-Agent': UA, Referer: referer, Origin: origin }],
      ['d: none', {}]
    ];
    const results = [];
    for (const [label, headers] of variants) {
      results.push(await fetchVariant(undiciRequest, target, label, headers));
    }
    allVariants.push({ id: t.id, target, branch, results });
  }

  // 4) Verdict
  console.log('\n=== VERDICT ===');
  for (const v of allVariants) {
    const okAny = v.results.find((r) => r.status === 200 && r.m3u8);
    const statuses = v.results.map((r) => `${r.label}=${r.error ? 'ERR' : r.status}`).join('  ');
    if (okAny) {
      const goodLabels = v.results.filter((r) => r.status === 200 && r.m3u8).map((r) => r.label).join(', ');
      console.log(`${v.id}: UPSTREAM ALIVE but header-sensitive — OK with [${goodLabels}] | ${statuses}`);
      console.log(`  => pre-flight/proxy MUST send exactly: ${goodLabels.includes('a:') ? 'UA only (Referer/Origin REJECTED by CDN)' : goodLabels}`);
    } else {
      console.log(`${v.id}: UPSTREAM DEAD/GEO-LOCKED for all header variants | ${statuses}`);
      console.log('  => pre-flight drops are faithful; playback through /api/manifest would fail identically');
    }
    console.log(`  construction branch: ${v.branch}`);
  }

  setTimeout(() => process.exit(0), 100).unref?.();
}

main().catch((e) => { console.error('repro fatal:', e); process.exit(1); });
