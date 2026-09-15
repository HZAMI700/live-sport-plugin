const { request } = require('undici');

async function testSegment() {
  const m3u8Url = 'https://cdnlivetv.tv/secure/api/v1/6a288d2e81d8192bb76ce89d/playlist.m3u8?token=NmEyODhkMmU4MWQ4MTkyYmI3NmNlODlkOjE3ODgzMTc3ODM2NjM6Y2RubGl2ZXR2LnR2OjNmYWQ5ODFiYzIzZGMxN2UuNDA1ZjIyNzY5YjIwMDdmZDY1YWQ0YzliNjQ5MjJiMmQwNzYzMGE2M2YxZGY1OTM1MGM3ZDgwYWJlYzRhODZkYg';
  const res = await request(m3u8Url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
      'Referer': 'https://streamsports99.fun/',
      'Origin': 'https://streamsports99.fun'
    }
  });
  const body = await res.body.text();
  const segmentPath = body.split('\n').find(line => line.startsWith('/stream-segment'));
  if (segmentPath) {
    const fullSeg = 'https://cdnlivetv.tv' + segmentPath.trim();
    console.log('Testing segment fetch with https://streamsports99.fun/ referer:');
    const sRes1 = await request(fullSeg, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
        'Referer': 'https://streamsports99.fun/',
        'Origin': 'https://streamsports99.fun'
      }
    });
    console.log('Referer streamsports99.fun status:', sRes1.statusCode);

    console.log('Testing segment fetch with https://cdnlivetv.is/ referer:');
    const sRes2 = await request(fullSeg, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
        'Referer': 'https://cdnlivetv.is/',
        'Origin': 'https://cdnlivetv.is'
      }
    });
    console.log('Referer cdnlivetv.is status:', sRes2.statusCode);
  }
}
testSegment().catch(console.error);
