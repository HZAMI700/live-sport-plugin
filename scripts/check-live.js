const https = require('https');

https.get('https://nuvio-live-sports-ybrh.onrender.com/manifest.json', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('App Manifest Status:', res.statusCode);
    console.log('Response Body:', data.substring(0, 150));
  });
}).on('error', (e) => {
  console.error('App Request Error:', e.message);
});
