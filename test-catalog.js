const child_process = require('child_process');
const server = child_process.spawn('node', ['src/index.js'], {env: {...process.env, PORT: '7077'}});
setTimeout(() => {
  const confStr = Buffer.from(JSON.stringify({timezone: 'Asia/Kolkata', sources: 'none'})).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  require('http').get('http://127.0.0.1:7077/' + confStr + '/catalog/tv/nuvio_sports_all.json', res => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log("STATUS:", res.statusCode);
      console.log("DATA LENGTH:", data.length);
      console.log("DATA PREVIEW:", data.substring(0, 500));
      server.kill();
      process.exit(0);
    });
  }).on('error', err => {
    console.log("ERR:", err);
    server.kill();
    process.exit(1);
  });
}, 3000);
