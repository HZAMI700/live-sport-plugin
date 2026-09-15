const container = require("./src/container.js");
const streamsHandler = require("./src/streams.js");

(async () => {
    const strims = container.resolve("strims24Provider");
    const matches = await strims.getMatches();
    const omonia = matches.find(m => m.title && m.title.includes("Omonia"));
    
    const cache = container.resolve("cacheService");
    cache.setMatches([omonia]);
    
    console.log("Calling handleStream with:", "nuvio_sport_" + omonia.id);
    const res = await streamsHandler.handleStream("tv", "nuvio_sport_" + omonia.id, {});
    console.log("handleStream output:", JSON.stringify(res, null, 2));
})();
