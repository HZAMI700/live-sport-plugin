const { request } = require('undici');

async function test() {
  const embedUrl = 'https://streamfree.top/embed/cricket/willow';
  const res = await request(embedUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
  });
  const cookie = res.headers['set-cookie'];
  const html = await res.body.text();
  const match = html.match(/const\s+_0x\s*=\s*(\{.*?\});/);
  
  if (match) {
    const tokens = JSON.parse(match[1]);
    const q = '1080p';
    const t = tokens[q] || tokens[Object.keys(tokens)[0]];
    
    const keyRes = await request('https://streamfree.top/get-stream-key/willow', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    const keyData = await keyRes.body.json();
    
    // Testing Origin URL
    const originUrl = `https://streamfree.top/live-cdn/willow${q}/index.m3u8?_t=${t._t}&_e=${t._e}&_n=${t._n}`;
    console.log('Testing Origin URL:', originUrl);
    
    const m3u8Res = await request(originUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Referer': 'https://streamfree.top/embed/cricket/willow',
        'Origin': 'https://streamfree.top',
        'Cookie': cookie ? (Array.isArray(cookie) ? cookie.join('; ') : cookie) : ''
      }
    });
    console.log('Origin M3U8 Status:', m3u8Res.statusCode);
    const body = await m3u8Res.body.text();
    console.log('Origin M3U8 Body sample:\n', body.substring(0, 300));
  }
}

test().catch(console.error);
