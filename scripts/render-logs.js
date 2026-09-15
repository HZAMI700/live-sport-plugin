const https = require('https');

const API_KEY = 'rnd_l3myN3T82ZONLqyi5ysQWWhZsoQe';
const SERVICE_ID = 'srv-d9dvflrrjlhs73behjtg';

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
  console.log('Fetching service info...');
  const svc = await renderReq(`/v1/services/${SERVICE_ID}`);
  console.log('Service status:', svc.status);
  
  let ownerId = svc.data?.ownerId || svc.data?.service?.ownerId;
  if (!ownerId) {
    const owners = await renderReq('/v1/owners');
    if (owners.data && owners.data.length > 0) {
      ownerId = owners.data[0].owner?.id || owners.data[0].id;
    }
  }
  console.log('Owner ID:', ownerId);

  if (!ownerId) {
    console.log('Could not determine owner ID. Dumping service response:', svc.data);
    return;
  }

  console.log('\n--- Fetching Latest Logs ---');
  const logsRes = await renderReq(`/v1/logs?ownerId=${ownerId}&resource=${SERVICE_ID}&limit=50&direction=backward`);
  console.log('Logs response status:', logsRes.status);
  
  if (Array.isArray(logsRes.data)) {
    logsRes.data.reverse().forEach(log => {
      console.log(`[${log.timestamp || ''}] ${log.message || JSON.stringify(log)}`);
    });
  } else if (logsRes.data?.logs) {
    logsRes.data.logs.reverse().forEach(log => {
      console.log(`[${log.timestamp || ''}] ${log.message || JSON.stringify(log)}`);
    });
  } else {
    console.log('Logs structure:', JSON.stringify(logsRes.data, null, 2));
  }
}

main().catch(console.error);
