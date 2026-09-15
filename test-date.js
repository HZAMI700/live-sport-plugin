const container = require("./src/container.js");

(async () => {
    const agg = container.resolve("matchAggregator");
    // Fix: Provider was removed, just testing aggregator sync now
    console.log("Date now:", Date.now());
    
    // Now let us run aggregator.syncMatches() and see if it ends up in cacheService
    await agg.syncMatches();
    const cache = container.resolve("cacheService");
    const cachedOmonia = cache.getMatches().find(m => m.title && m.title.includes("Omonia"));
    console.log("In cache after sync?", !!cachedOmonia, cachedOmonia);
    
    // Check if it passes handleCatalog filters in catalog.js
    const catalogHandler = require("./src/catalog.js");
    const cat = await catalogHandler.handleCatalog("tv", "nuvio_sports_all", {}, {});
    const inCat = (cat.metas || []).find(m => m.name && m.name.includes("Omonia"));
    console.log("In handleCatalog nuvio_sports_all?", !!inCat, inCat);

    // Check handleStream in streams.js
    if (cachedOmonia) {
        const streamsHandler = require("./src/streams.js");
        const streamRes = await streamsHandler.handleStream("tv", cachedOmonia.id, {});
        console.log("handleStream result:", JSON.stringify(streamRes, null, 2));
    }
})();
