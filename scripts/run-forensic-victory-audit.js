const { request } = require('undici');
const fs = require('fs');
const path = require('path');

async function comprehensiveAudit() {
  console.log('='.repeat(80));
  console.log('  🏆 INDEPENDENT FORENSIC VICTORY AUDIT — EMPIRICAL VERIFICATION');
  console.log('='.repeat(80) + '\n');

  const results = [];
  const record = (reqId, title, pass, detail) => {
    results.push({ reqId, title, pass, detail });
    const mark = pass ? 'PASS [OK]' : 'FAIL [X] ';
    console.log(`  ${mark} | ${reqId.padEnd(8)} | ${title.padEnd(46)} | ${detail}`);
  };

  const BASE = 'http://localhost:7000';

  // 1. Health
  const hRes = await request(BASE + '/health');
  const hJson = await hRes.body.json();
  record('R0', 'Server Health & State', hRes.statusCode === 200 && hJson.status === 'ok', 'Status ' + hRes.statusCode);

  // 2. Static IP Grep across src/, .env, public/
  const srcFiles = [];
  function scan(dir) {
    for (const f of fs.readdirSync(dir)) {
      const full = path.join(dir, f);
      if (fs.statSync(full).isDirectory()) scan(full);
      else srcFiles.push(full);
    }
  }
  scan(path.join(process.cwd(), 'src'));
  scan(path.join(process.cwd(), 'public'));
  srcFiles.push(path.join(process.cwd(), '.env'));

  let ipLeaks = [];
  for (const f of srcFiles) {
    const text = fs.readFileSync(f, 'utf8');
    if (text.includes('192.168.0.')) ipLeaks.push(f);
  }
  record('R1.1', 'Zero Hardcoded 192.168.0.xx in Source Code', ipLeaks.length === 0, ipLeaks.length === 0 ? '0 occurrences in ' + srcFiles.length + ' files' : 'Leaks in ' + ipLeaks.join(', '));

  // 3. Dynamic Host in Manifest
  const simHost = 'addon-sports.my-ngrok-domain.io';
  const mRes = await request(BASE + '/manifest.json', {
    headers: { 'host': simHost, 'x-forwarded-proto': 'https' }
  });
  const mData = await mRes.body.json();
  const mNoIp = !JSON.stringify(mData).includes('192.168.0.');
  record('R1.2', 'Manifest Dynamic Host Resolution', mRes.statusCode === 200 && mNoIp, 'Manifest served without LAN IPs');

  // 4. Dynamic Host in Catalog
  const cRes = await request(BASE + '/catalog/tv/nuvio_sports_live.json', {
    headers: { 'host': simHost, 'x-forwarded-proto': 'https' }
  });
  const cData = await cRes.body.json();
  const sampleMeta = cData.metas?.[0];
  const posterRewritten = sampleMeta?.poster?.startsWith('https://' + simHost + '/img');
  const backgroundRewritten = sampleMeta?.background?.startsWith('https://' + simHost + '/img');
  const logoRewritten = sampleMeta?.logo?.startsWith('https://' + simHost + '/img');
  record('R1.3', 'Catalog Dynamic Host Rewriting', posterRewritten && backgroundRewritten && logoRewritten, 'Poster: ' + sampleMeta?.poster?.slice(0, 50) + '...');

  // 5. Reverse Proxy Header Combinations
  const xfHost = 'forwarded.my-vps.net';
  const cfRes = await request(BASE + '/catalog/tv/nuvio_sports_live.json', {
    headers: { 'x-forwarded-host': xfHost, 'x-forwarded-proto': 'https', 'host': '127.0.0.1:7000' }
  });
  const cfData = await cfRes.body.json();
  const xfRewritten = cfData.metas?.[0]?.poster?.startsWith('https://' + xfHost + '/img');
  record('R1.4', 'X-Forwarded-Host Priority & Header Handling', xfRewritten, 'Rewrote to https://' + xfHost);

  // 6. Thumbnail 200 OK & CORS
  let imgSuccess = 0;
  let corsSuccess = 0;
  const testMetas = cData.metas?.slice(0, 15) || [];
  for (const m of testMetas) {
    if (m.poster) {
      const localUrl = m.poster.replace(/^https?:\/\/[^\/]+/, BASE);
      const imgRes = await request(localUrl);
      const ct = imgRes.headers['content-type'] || '';
      const acao = imgRes.headers['access-control-allow-origin'];
      if (imgRes.statusCode === 200 && (ct.includes('image/') || ct.includes('svg+xml'))) imgSuccess++;
      if (acao === '*') corsSuccess++;
    }
  }
  record('R2.1', 'Catalog Thumbnails 200 OK Delivery', imgSuccess === testMetas.length, `${imgSuccess}/${testMetas.length} valid images`);
  record('R2.2', 'Thumbnail Proxy CORS Header', corsSuccess === testMetas.length, `${corsSuccess}/${testMetas.length} with Access-Control-Allow-Origin: *`);

  // 7. Dead Image Resilient Fallback
  const deadRes = await request(BASE + '/img?url=https://completely-dead-domain.invalid/nonexistent.png&text=TestFallback&color=10b981');
  const deadCt = deadRes.headers['content-type'] || '';
  const deadCors = deadRes.headers['access-control-allow-origin'];
  record('R2.3', 'Dead Upstream Image SVG Fallback', deadRes.statusCode === 200 && deadCt.includes('svg+xml') && deadCors === '*', `Status ${deadRes.statusCode}, Type: ${deadCt}`);

  // 8. Stream Resolution & Dynamic Host
  const testMatch = cData.metas?.[0];
  const sRes = await request(BASE + '/stream/tv/' + testMatch.id + '.json', {
    headers: { 'host': simHost, 'x-forwarded-proto': 'https' }
  });
  const sData = await sRes.body.json();
  const streams = sData.streams || [];
  let streamsValid = streams.length > 0;
  streams.forEach(s => {
    if (s.url && s.url.includes('/api/manifest') && !s.url.startsWith('https://' + simHost)) streamsValid = false;
    if (s.externalUrl && s.externalUrl.includes('/watch') && !s.externalUrl.startsWith('https://' + simHost)) streamsValid = false;
  });
  record('R3.1', 'Stream Array Resolution & Dynamic URLs', streamsValid, `${streams.length} streams resolved for ${testMatch.id}`);

  // 9. M3U8 Manifest Verification
  const directStream = streams.find(s => s.url && s.url.includes('/api/manifest'));
  if (directStream) {
    const localManifestUrl = directStream.url.replace(/^https?:\/\/[^\/]+/, BASE);
    const m3u8Res = await request(localManifestUrl);
    const m3u8Text = await m3u8Res.body.text();
    const m3u8Ok = m3u8Res.statusCode === 200 && m3u8Text.includes('#EXTM3U');
    record('R3.2', 'HLS M3U8 Manifest Proxy Playback', m3u8Ok, `Status ${m3u8Res.statusCode}, Contains #EXTM3U: ${m3u8Text.includes('#EXTM3U')}`);
  }

  // 10. Web Embed Proxy (/watch)
  const webStream = streams.find(s => s.externalUrl);
  if (webStream) {
    const localWatchUrl = webStream.externalUrl.replace(/^https?:\/\/[^\/]+/, BASE);
    const wRes = await request(localWatchUrl);
    const wText = await wRes.body.text();
    const wOk = wRes.statusCode === 200 && (wText.includes('video') || wText.includes('player') || wText.includes('iframe'));
    record('R3.3', 'Web Embed Proxy Page (/watch)', wOk, `Status ${wRes.statusCode}`);
  }

  console.log('\n' + '='.repeat(80));
  const allPass = results.every(r => r.pass);
  console.log(`  FINAL AUDIT VERDICT: ${allPass ? '🎉 VICTORY CONFIRMED (100% PASS)' : '❌ VICTORY REJECTED'}`);
  console.log('='.repeat(80) + '\n');
  if (!allPass) process.exit(1);
}

comprehensiveAudit().catch((err) => {
  console.error('[FATAL] Audit failure:', err);
  process.exit(1);
});
