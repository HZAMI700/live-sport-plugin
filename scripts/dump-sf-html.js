const { request } = require('undici');

async function dump() {
  const embedUrl = 'https://streamfree.top/embed/cricket/willow';
  const res = await request(embedUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
  });
  const html = await res.body.text();
  console.log(html);
}

dump().catch(console.error);
