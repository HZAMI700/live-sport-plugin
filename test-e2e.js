const container = require("./src/container.js");
const { handleStream } = require("./src/streams.js");

async function run() {
    console.log("=== Pipeline E2E Test ===");

    // 1. Ingest
    console.log("\n[1] Testing Ingest & Cache Write");
    const aggregator = container.resolve('matchAggregator');
    const cacheService = container.resolve('cacheService');
    
    console.log("Fetching matches...");
    await aggregator.syncMatches();
    const cached = cacheService.getMatches();
    console.log(`Ingested ${cached.length} active matches.`);
    console.log(`Cache read returned ${cached.length} matches.`);

    if (cached.length === 0) {
        console.error("No matches ingested. Cannot continue.");
        return;
    }

    // Pick a match with multiple sources
    const match = cached.find(m => m.sources && m.sources.length > 1) || cached[0];
    console.log(`\n[2] Selected Match for Stream Conversion: ${match.title} (${match.category})`);
    console.log(`ID: ${match.id}`);
    console.log(`Sources available:`, match.sources.map(s => s.source).join(", "));

    // 2. Stream Conversion
    console.log("\n[3] Testing Stream Conversion (Resolve & Verify) - Cache Miss");
    const startMiss = Date.now();
    const resultMiss = await handleStream('tv', 'nuvio_sport_' + match.id);
    const timeMiss = Date.now() - startMiss;
    console.log(`Initial resolve took ${timeMiss}ms. Found ${resultMiss.streams.length} output streams.`);

    // 3. Cache Read
    console.log("\n[4] Testing Cache Read (StreamResolveCache)");
    const startHit = Date.now();
    const resultHit = await handleStream('tv', 'nuvio_sport_' + match.id);
    const timeHit = Date.now() - startHit;
    console.log(`Cached resolve took ${timeHit}ms. Found ${resultHit.streams.length} output streams.`);

    const streamResolveCache = container.resolve('streamResolveCache');
    const stats = streamResolveCache.stats();
    console.log("\n[5] StreamResolveCache Stats:");
    console.log(JSON.stringify(stats, null, 2));

    // Audit Data
    const auditData = resultMiss.streams.map(s => {
        return {
            title: s.title,
            name: s.name,
            url: s.url || (s.externalUrl ? s.externalUrl : "N/A")
        };
    });

    console.log("\n[6] Audit Data Generated. Saving to file for reporting...");
    const fs = require('fs');
    fs.writeFileSync('e2e-audit-data.json', JSON.stringify({ match, stats, timeMiss, timeHit, streams: auditData }, null, 2));
}

run().catch(console.error);
