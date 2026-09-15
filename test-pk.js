const container = require("./src/container.js");
(async () => {
    console.log("Testing StreamedPkProvider...");
    try {
        const provider = container.resolve("streamedPkProvider");
        const matches = await provider.getMatches();
        console.log("Found", matches.length, "matches");
        
        let totalStreams = 0;
        let directStreams = 0;
        let failedStreams = 0;
        
        for (const match of matches) { 
            if (!match.sources) continue;
            for (const src of match.sources) {
                try {
                    const streams = await provider.resolveStream(src.id, match.category, match.title, src);
                    totalStreams += streams.length;
                    for (const stream of streams) {
                        if (stream.url) {
                             directStreams++;
                        }
                    }
                } catch (e) {
                    failedStreams++;
                }
            }
        }
        console.log("Total resolved stream links:", totalStreams);
        console.log("Direct streams (has url / m3u8):", directStreams);
        console.log("Failed resolves:", failedStreams);
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();
