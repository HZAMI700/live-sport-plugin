const { handleCatalog } = require('./src/catalog');
const container = require('./src/container');

const timezonesToTest = Intl.supportedValuesOf('timeZone');
const STANDARD_TZ = 'Asia/Kolkata';

const now = Date.now();
const mockMatches = [
  // Time-based matches (no explicit status)
  { id: '1', title: 'Live Match', category: 'football', status: '', date: now.toString() },
  { id: '2', title: 'Upcoming Match', category: 'football', status: '', date: (now + 86400000).toString() },
  { id: '3', title: 'Finished Match', category: 'football', status: '', date: (now - 86400000).toString() },
  { id: '4', title: 'Network 24/7', category: 'networks', status: '', date: '' },
];

container.resolve('cacheService').getMatches = () => mockMatches;
container.resolve('cronService').ensureFresh = () => {};

async function testAllTimezones() {
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
  let failures = [];

  for (const tz of timezonesToTest) {
    try {
      const res = await handleCatalog('tv', 'nuvio_sports_live', { config: { timezone: tz } });
      const metas = res.metas;
      
      if (metas.length !== standardMetas.length) {
        console.error(`❌ Mismatch in length for ${tz}: Expected ${standardMetas.length}, got ${metas.length}`);
        allPassed = false;
        failures.push(tz);
      } else {
        const diff = metas.map(m => m.id).filter(id => !standardMetas.map(m => m.id).includes(id));
        if (diff.length > 0) {
          console.error(`❌ Mismatch in IDs for ${tz}: ${diff}`);
          allPassed = false;
          failures.push(tz);
        }
      }
    } catch (e) {
      console.error(`❌ Error fetching ${tz}:`, e.message);
      allPassed = false;
      failures.push(tz);
    }
  }

  if (allPassed) {
    console.log(`All ${timezonesToTest.length} timezones gave the exact same matches as IST. Working perfect!`);
    process.exit(0);
  } else {
    console.log(`Some timezones failed: ${failures.length}`);
    process.exit(1);
  }
}

testAllTimezones();
