const https = require('https');

const API_KEY = 'rnd_l3myN3T82ZONLqyi5ysQWWhZsoQe';
const SERVICE_ID = 'srv-d9dvflrrjlhs73behjtg';
const OWNER_ID = 'tea-d55futbuibrs7391q0r0';

function renderReq(path) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'api.render.com',
      path: path,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Accept': 'application/json'
      }
    };
    https.get(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch(e) {
          resolve({ status: res.statusCode, data });
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  const logsRes = await renderReq(`/v1/logs?ownerId=${OWNER_ID}&resource=${SERVICE_ID}&limit=100&direction=backward`);
  if (Array.isArray(logsRes.data)) {
    logsRes.data.forEach(l => {
      if (l.message) console.log(l.message);
    });
  }
}

main().catch(console.error);
