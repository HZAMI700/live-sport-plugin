const { request } = require('undici');

async function testFetch() {
  const m3u8Url = 'https://cdnlivetv.tv/secure/api/v1/6a288d2e81d8192bb76ce89d/playlist.m3u8?token=NmEyODhkMmU4MWQ4MTkyYmI3NmNlODlkOjE3ODgzMTc3ODM2NjM6Y2RubGl2ZXR2LnR2OjNmYWQ5ODFiYzIzZGMxN2UuNDA1ZjIyNzY5YjIwMDdmZDY1YWQ0YzliNjQ5MjJiMmQwNzYzMGE2M2YxZGY1OTM1MGM3ZDgwYWJlYzRhODZkYg';
  console.log('Fetching m3u8 playlist...');
  const res = await request(m3u8Url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
      'Referer': 'https://streamsports99.fun/',
      'Origin': 'https://streamsports99.fun'
    }
  });
  console.log('Status:', res.statusCode);
  const body = await res.body.text();
  console.log('Body:\n', body);
}
testFetch().catch(console.error);
