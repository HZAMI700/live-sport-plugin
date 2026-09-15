const container = require('../src/container');
const ss99 = container.resolve('streamSports99Provider');

async function test() {
  const matches = await ss99.getMatches();
  console.log('Total SS99 matches:', matches.length);
  const live = matches.filter(m => m.status === 'live');
  console.log('Live SS99 matches:', live.length);
  if (matches.length > 0) {
    const target = live[0] || matches[0];
    console.log('Testing match:', target.title, target.sources[0].id);
    const resolved = await ss99.resolveStream(target.sources[0].id, target.category, target.title);
    console.log('Resolved streams count:', resolved.length);
    resolved.forEach((s, idx) => {
      console.log(`[${idx}] Title: ${s.title} | URL: ${s.url || s.externalUrl}`);
      console.log(`     proxyHeaders:`, JSON.stringify(s.behaviorHints?.proxyHeaders));
    });
  }
}
test().catch(console.error);
