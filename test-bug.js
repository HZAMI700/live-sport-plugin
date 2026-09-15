const container = require('./src/container');
const sf = container.resolve('streamFreeProvider');
const spk = container.resolve('streamedPkProvider');

async function test() {
  console.log('--- SPK Fox Cricket ---');
  try {
    const spkStreams = await spk.resolveStream('fox-cricket', 'cricket', 'Fox Cricket');
    console.log(spkStreams);
    const spkStreams2 = await spk.resolveStream('willow-cricket', 'cricket', 'Willow Cricket');
    console.log(spkStreams2);
  } catch(e) { console.error(e); }

  console.log('--- SF Test ---');
  try {
     const matches = await sf.getMatches();
     if(matches.length > 0) {
        console.log('SF match:', matches[0].title, matches[0].id);
        const sfStreams = await sf.resolveStream(matches[0].sources[0].id, matches[0].category, matches[0].title);
        console.log(sfStreams);
     }
  } catch(e) { console.error(e); }
}
test();
