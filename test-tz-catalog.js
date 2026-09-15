const { handleCatalog } = require('./src/catalog');
const container = require('./src/container');

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

// Mock cache service
const now = Date.now();
const mockMatches = [
  { id: '1', title: 'Live Match', category: 'football', status: 'live', date: now.toString() },
  { id: '2', title: 'Upcoming Match', category: 'football', status: 'upcoming', date: (now + 86400000).toString() },
  { id: '3', title: 'Old Match', category: 'football', status: 'finished', date: (now - 86400000).toString() },
  { id: '4', title: 'Network 24/7', category: 'networks', status: 'live', date: '' },
  { id: '5', title: 'Live Cricket', category: 'cricket', status: 'in', date: now.toString() }
];

container.resolve('cacheService').getMatches = () => mockMatches;

// Also mock cronService to avoid side effects
container.resolve('cronService').ensureFresh = () => {};

async function testTimezones() {
  console.log(`Testing standard timezone: ${STANDARD_TZ}`);
  let standardMetas;
  try {
    const res = await handleCatalog('tv', 'nuvio_sports_live', { config: { timezone: STANDARD_TZ } });
    standardMetas = res.metas;
    console.log(`Found ${standardMetas.length} matches for ${STANDARD_TZ}.`);
  } catch (e) {
    console.error('Failed fetching standard TZ', e);
    process.exit(1);
  }

  let allPassed = true;
  for (const tz of timezonesToTest) {
    try {
      const res = await handleCatalog('tv', 'nuvio_sports_live', { config: { timezone: tz } });
      const metas = res.metas;
      
      if (metas.length !== standardMetas.length) {
        console.error(`❌ Mismatch in length for ${tz}: Expected ${standardMetas.length}, got ${metas.length}`);
        allPassed = false;
      } else {
        const diff = metas.map(m => m.id).filter(id => !standardMetas.map(m => m.id).includes(id));
        if (diff.length > 0) {
          console.error(`❌ Mismatch in IDs for ${tz}: ${diff}`);
          allPassed = false;
        } else {
          console.log(`✅ ${tz} passed (${metas.length} matches)`);
        }
      }
    } catch (e) {
      console.error(`❌ Error fetching ${tz}:`, e.message);
      allPassed = false;
    }
  }

  if (allPassed) {
    console.log("All timezones gave the exact same matches as IST. Working perfect!");
    process.exit(0);
  } else {
    console.log("Some timezones failed.");
    process.exit(1);
  }
}

testTimezones();
