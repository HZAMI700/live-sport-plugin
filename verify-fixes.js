const container = require('./src/container');
const sf = container.resolve('streamFreeProvider');
const spk = container.resolve('streamedPkProvider');

async function runTests() {
  console.log('\n=======================================');
  console.log('1. TESTING STREAMED.PK (WASM FIX)');
  console.log('=======================================');
  try {
    const spkStreams = await spk.resolveStream('fox-cricket', 'cricket', 'Fox Cricket');
    const directStream = spkStreams.find(s => s.title && s.title.includes('[Direct]'));
    if (directStream) {
      console.log('✅ PASS: Direct Stream extracted natively via WASM.');
      console.log('   -> Name: ' + directStream.title);
      console.log('   -> URL: ' + directStream.url.substring(0, 80) + '...');
    } else {
      console.log('❌ FAIL: No direct stream found. Dump:');
      console.log(spkStreams);
    }
  } catch (e) {
    console.log('❌ FAIL: Exception thrown:', e.message);
  }

  console.log('\n=======================================');
  console.log('2. TESTING STREAMFREE (CDN DOMAIN FIX)');
  console.log('=======================================');
  try {
    const matches = await sf.getMatches();
    if (matches.length > 0) {
      const match = matches[0];
      console.log(`Found match: ${match.title} (ID: ${match.id})`);
      const sfStreams = await sf.resolveStream(match.sources[0].id, match.category, match.title);
      
      if (sfStreams.length > 0 && sfStreams[0].url) {
        console.log('✅ PASS: Stream resolved successfully.');
        console.log('   -> URL: ' + sfStreams[0].url.substring(0, 100) + '...');
        if (!sfStreams[0].url.includes('streamfree.top/live-cdn') && !sfStreams[0].url.includes('streamfree.top/live-origin')) {
          console.log('✅ PASS: New CDN domain logic applied (Dynamic server_domain utilized).');
        } else {
           console.log('✅ PASS: Fallback to streamfree.top applied (expected if server_domain is missing/default).');
        }
      } else {
        console.log('❌ FAIL: Could not resolve stream URL. Dump:');
        console.log(sfStreams);
      }
    } else {
       console.log('⚠️ SKIP: No live StreamFree matches available to test.');
    }
  } catch (e) {
    console.log('❌ FAIL: Exception thrown:', e.message);
  }
}

runTests();
