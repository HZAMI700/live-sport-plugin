const { request } = require('undici');

async function test() {
  const embedUrl = 'https://streamfree.top/embed/cricket/willow';
  const res = await request(embedUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
  });
  const html = await res.body.text();
  const match = html.match(/const\s+_0x\s*=\s*(\{.*?\});/);
  console.log('Found tokens:', match ? Object.keys(JSON.parse(match[1])) : 'None');
  
  if (match) {
    const tokens = JSON.parse(match[1]);
    const q = Object.keys(tokens)[0];
    const t = tokens[q];
    console.log('Testing quality:', q, t);
    
    const keyRes = await request('https://streamfree.top/get-stream-key/willow', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    const keyData = await keyRes.body.json();
    console.log('Key Data:', keyData);
    
    const domain = keyData.server_domain || 'https://streamfree.top';
    const serverName = keyData.server_name || 'origin';
    const baseUrl = serverName !== 'origin' 
      ? `${domain}/live-cdn/willow${q}/index.m3u8`
      : `${domain}/live-origin/willow${q}/index.m3u8`;
      
    const fullUrl = `${baseUrl}?_t=${t._t}&_e=${t._e}&_n=${t._n}`;
    console.log('Testing M3U8 fetch from:', fullUrl);
    
    const m3u8Res = await request(fullUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Referer': 'https://streamfree.top/',
        'Origin': 'https://streamfree.top'
      }
    });
    console.log('M3U8 Status:', m3u8Res.statusCode);
    const body = await m3u8Res.body.text();
    console.log('M3U8 Body sample:', body.substring(0, 200));
  }
}

test().catch(console.error);
