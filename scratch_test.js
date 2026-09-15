const TimStreamsProvider = require('./src/providers/TimStreamsProvider');

async function test() {
  const provider = new TimStreamsProvider({ circuitBreaker: { wrap: (n, f) => { f.fire = f; return f; } } });
  
  // mock proxyFetch if needed, but it inherits from BaseProvider so we should provide mock opts or let it use default
  
  console.log('Fetching matches from TimStreams...');
  const matches = await provider.getMatches();
  
  console.log(`Found ${matches.length} matches.`);
  if (matches.length > 0) {
    console.log('Sample Match:', JSON.stringify(matches[0], null, 2));
    
    // Test resolving a stream
    if (matches[0].sources.length > 0) {
        console.log('Resolving first source...');
        const stream = await provider.resolveStream(matches[0].sources[0].id, matches[0].category, matches[0].title);
        console.log('Stream result:', JSON.stringify(stream, null, 2));
    }
  }
}

test().catch(console.error);
