const child_process = require('child_process');
const http = require('http');

const timezonesToTest = [
  'America/New_York', 'America/Los_Angeles', 'America/Chicago',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Moscow',
  'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Dubai', 'Asia/Singapore',
  'Australia/Sydney', 'Australia/Perth',
  'Pacific/Auckland', 'Pacific/Honolulu',
  'Africa/Cairo', 'Africa/Johannesburg',
  'UTC', 'GMT'
];

const STANDARD_TZ = 'Asia/Kolkata';

// Start server
const server = child_process.spawn('node', ['src/index.js'], {env: {...process.env, PORT: '7088'}});

function fetchCatalog(timezone) {
  return new Promise((resolve, reject) => {
    const confStr = Buffer.from(JSON.stringify({timezone, sources: 'none'}))
      .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    
    // Test 'all' category so we get matches regardless of live status to ensure a robust test
    http.get(`http://127.0.0.1:7088/${confStr}/catalog/tv/nuvio_sports_all.json`, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            return reject(new Error(`Status ${res.statusCode} for ${timezone}`));
          }
          const parsed = JSON.parse(data);
          resolve(parsed.metas.map(m => m.id));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

setTimeout(async () => {
  console.log(`Testing standard timezone: ${STANDARD_TZ}`);
  let standardMatches;
  try {
    standardMatches = await fetchCatalog(STANDARD_TZ);
    console.log(`Found ${standardMatches.length} total matches for ${STANDARD_TZ}.`);
  } catch (e) {
    console.error('Failed fetching standard TZ', e);
    server.kill();
    process.exit(1);
  }

  let allPassed = true;
  for (const tz of timezonesToTest) {
    try {
      const matches = await fetchCatalog(tz);
      if (matches.length !== standardMatches.length) {
        console.error(`❌ Mismatch in length for ${tz}: Expected ${standardMatches.length}, got ${matches.length}`);
        allPassed = false;
      } else {
        const diff = matches.filter(id => !standardMatches.includes(id));
        if (diff.length > 0) {
          console.error(`❌ Mismatch in IDs for ${tz}: ${diff}`);
          allPassed = false;
        } else {
          console.log(`✅ ${tz} passed (${matches.length} matches)`);
        }
      }
    } catch (e) {
      console.error(`❌ Error fetching ${tz}:`, e.message);
      allPassed = false;
    }
  }

  server.kill();
  if (allPassed) {
    console.log("All timezones gave the exact same matches as IST. Working perfect!");
    process.exit(0);
  } else {
    console.log("Some timezones failed.");
    process.exit(1);
  }
}, 5000);
