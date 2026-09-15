#!/usr/bin/env node
/** scripts/verify-time-format.js — verify catalog.js renders kickoff times in 24-hour format */
(async () => {
  const container = require('../src/container');
  const { handleMeta } = require('../src/catalog');
  const cacheService = container.resolve('cacheService');

  const future = Date.now() + 2 * 3600 * 1000; // kickoff in 2h -> not live -> 'Kickoff at ...'
  console.log('actual UTC time: ' + new Date(future).toISOString());
  cacheService.setMatches([{
    id: 'tz_format_test', title: 'TZ Format Test FC vs Rovers', category: 'football',
    date: String(future), popular: '1',
    sources: [{ source: 'iptv-org', id: 'x', quality: '1080p', url: 'http://127.0.0.1:1/x.m3u8' }]
  }]);

  let failed = false;
  for (const cfg of [{}, { timezone: 'Asia/Calcutta' }, { timezone: 'America/New_York' }]) {
    const res = await handleMeta('tv', 'nuvio_sport_tz_format_test', cfg);
    const desc = res.meta.description || '';
    const m = desc.match(/Kickoff at ([^\n(]+)/);
    const ts = m ? m[1].trim() : '(none)';
    const is24h = /^\d{1,2}:\d{2}$/.test(ts) && !/\b(AM|PM)\b/i.test(desc.replace(/\([^)]*\)/g, ''));
    console.log('config=' + JSON.stringify(cfg) + ' -> timeString="' + ts + '"  24h-no-AM/PM: ' + (is24h ? 'PASS' : 'FAIL'));
    if (!is24h) failed = true;
  }

  // Midnight edge via the exact edited expression: h23 must render 00:xx, never 24:xx
  const mid = new Date(Date.UTC(2026, 8, 1, 0, 5));
  const s = mid.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'UTC' });
  console.log('midnight UTC 00:05 renders as: "' + s + '"  (expect 00:05) ' + (s === '00:05' ? 'PASS' : 'FAIL'));
  if (s !== '00:05') failed = true;

  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
