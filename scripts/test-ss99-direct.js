const { request } = require('undici');

async function test() {
  const apiUrl = 'https://api.cdnlivetv.is/api/v1/events/sports/?user=streamsports99&plan=vip';
  const res = await request(apiUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });
  const data = await res.body.json();
  const sportsData = data?.['cdn-live-tv'] || {};
  let sampleCh = null;
  for (const cat of Object.keys(sportsData)) {
    const list = sportsData[cat];
    if (Array.isArray(list)) {
      for (const ev of list) {
        if (ev.channels && ev.channels.length > 0) {
          sampleCh = ev.channels[0];
          console.log(`Found event: ${ev.name || ev.homeTeam} | Channel: ${sampleCh.channel_name} | URL: ${sampleCh.url}`);
          break;
        }
      }
    }
    if (sampleCh) break;
  }
  
  if (sampleCh && sampleCh.url) {
    console.log('Fetching player page:', sampleCh.url);
    const pRes = await request(sampleCh.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://streamsports99.fun/'
      }
    });
    console.log('Player status:', pRes.statusCode);
    const html = await pRes.body.text();
    console.log('HTML preview (first 400 chars):', html.substring(0, 400));
  }
}
test().catch(console.error);
