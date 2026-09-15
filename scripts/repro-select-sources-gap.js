#!/usr/bin/env node
/**
 * scripts/repro-select-sources-gap.js — OFFLINE REPRO for Bug A (no network)
 *
 * BUG A: src/streams.js selectSources() — the DEFAULT path (no user config) has a
 * KNOWN_FALLBACKS array that OMITS 'embedindia', while the config-filtered path
 * (config.sources = 'a,b,c') INCLUDES it. Evidence:
 *   - src/streams.js:19  (config path)  KNOWN_FALLBACKS = [... 'embedindia' ...]
 *   - src/streams.js:30  (default path) KNOWN_FALLBACKS = [... no 'embedindia' ...]
 *
 * selectSources is NOT exported from src/streams.js (verified at runtime), so this
 * repro mirrors the two filter paths verbatim (structure + arrays) with line
 * citations, and demonstrates the behavioral difference on a fixed input.
 * If src/streams.js ever exports selectSources, prefer importing it instead.
 *
 * Run: node scripts/repro-select-sources-gap.js   (exits 1 on unexpected behavior)
 */

const fs = require('fs');
const path = require('path');

const streamsSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'streams.js'), 'utf8');

// ── Guard: the citation must still be true. Assert the exact array contents. ──
const configPathArr = ['watchfooty', 'cdnlive', 'streamsports99', 'streamic', 'strims24', 'streamfree', 'timstreams', 'sportyhunter', 'streamsports', 'iptv-org', 'embedindia', 'embedst', 'streamedpk'];
const defaultPathArr = ['watchfooty', 'cdnlive', 'streamsports99', 'streamic', 'strims24', 'streamfree', 'timstreams', 'sportyhunter', 'streamsports', 'iptv-org', 'embedst', 'streamedpk'];

// Extract both KNOWN_FALLBACKS arrays from the live source to prove they diverge.
const arrMatches = [...streamsSrc.matchAll(/const KNOWN_FALLBACKS = \[([^\]]+)\]/g)].map(m =>
  m[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean)
);
if (arrMatches.length !== 2) {
  console.error('FATAL: expected exactly 2 KNOWN_FALLBACKS arrays in src/streams.js, found ' + arrMatches.length);
  process.exit(1);
}
const liveConfigArr = arrMatches[0];   // first occurrence = config-filtered path (line ~19)
const liveDefaultArr = arrMatches[1];  // second occurrence = default path (line ~30)

console.log('=== Bug A repro: selectSources() default-path filter drops embedindia ===');
console.log('Evidence: src/streams.js has two KNOWN_FALLBACKS arrays:');
console.log(`  config path  (line ~19): ${JSON.stringify(liveConfigArr)}`);
console.log(`  default path (line ~30): ${JSON.stringify(liveDefaultArr)}`);

let ok = true;
const eq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
console.log(`  config-path array matches citation: ${eq(liveConfigArr, configPathArr) ? 'PASS' : (ok = false, 'FAIL')}`);
console.log(`  default-path array matches citation: ${eq(liveDefaultArr, defaultPathArr) ? 'PASS' : (ok = false, 'FAIL')}`);
console.log(`  'embedindia' in config path: ${liveConfigArr.includes('embedindia')} (expected true)`);
console.log(`  'embedindia' in default path: ${liveDefaultArr.includes('embedindia')} (expected false ← BUG)`);

// ── Behavioral repro: mirror the exact sort+filter flow of both paths ────────
// (verbatim structure from src/streams.js selectSources, lines ~6-33)
const SOURCE_PRIORITY = { admin: 1, echo: 1, golf: 1, delta: 1, 'watchfooty': 2, 'cdnlive': 3, 'streamsports99': 4, 'streamic': 5, 'strims24': 7, 'streamfree': 8, 'timstreams': 9, 'sportyhunter': 12, 'streamsports': 13, 'iptv-org': 14, 'embedindia': 15 };

function sortSources(matchSources) {
  return [...matchSources].sort((a, b) => {
    const getPriority = (src) => SOURCE_PRIORITY[src.source] ?? (['watchfooty', 'cdnlive', 'streamsports99', 'streamic', 'strims24', 'streamfree', 'timstreams', 'sportyhunter', 'streamsports', 'iptv-org'].includes(src.source) ? 99 : 1.5);
    const pa = getPriority(a.source);
    const pb = getPriority(b.source);
    if (pa !== pb) return pa - pb;
    return 0;
  });
}

function defaultPathFilter(matchSources) {
  const sorted = sortSources(matchSources);
  return sorted.filter(src => {
    if (src.source.startsWith('yaml_')) return true;
    return liveDefaultArr.includes(src.source);
  });
}

function configPathFilter(matchSources, config) {
  const sorted = sortSources(matchSources);
  if (config && typeof config.sources === 'string' && config.sources !== 'none') {
    const enabled = config.sources.split(',');
    return sorted.filter(src => {
      if (src.source.startsWith('yaml_')) return true;
      const isFallback = liveConfigArr.includes(src.source);
      return isFallback ? enabled.includes(src.source) : false;
    });
  }
  return sorted;
}

const matchSources = [
  { source: 'embedindia', id: 'e1' },
  { source: 'iptv-org', id: 'i1' },
  { source: 'streamfree', id: 's1' },
];

const gotDefault = defaultPathFilter(matchSources).map(s => s.source);
const gotConfig = configPathFilter(matchSources, { sources: 'embedindia,iptv-org,streamfree' }).map(s => s.source);

console.log('\nInput match.sources: embedindia + iptv-org + streamfree');
console.log(`  DEFAULT path (no config)  keeps: [${gotDefault.join(', ')}]  → embedindia ${gotDefault.includes('embedindia') ? 'KEPT' : 'DROPPED ← bug manifests here'}`);
console.log(`  CONFIG path (sources=...) keeps: [${gotConfig.join(', ')}]  → embedindia ${gotConfig.includes('embedindia') ? 'KEPT' : 'DROPPED'}`);

const bugReproduced = !gotDefault.includes('embedindia') && gotConfig.includes('embedindia') && gotDefault.includes('iptv-org') && gotDefault.includes('streamfree');
console.log(`\nBUG A REPRODUCED: ${bugReproduced ? 'YES' : 'NO'}`);
console.log('Impact today: latent — live catalog currently contains 0 embedindia sources');
console.log('(see scratch/e2e-audit/stream-audit.md summary line "embedindia sources in catalog / filtered as absent: 0 / 0").');
console.log('Any future embedindia source in a match is silently unselectable unless the user manually sets config.sources.');

process.exit(ok && bugReproduced ? 0 : 1);
