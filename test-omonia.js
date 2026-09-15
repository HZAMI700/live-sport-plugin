const container = require("./src/container.js");
(async () => {
    try {
        const providers = [
            { name: "streamedPkProvider", p: container.resolve("streamedPkProvider") },
            { name: "strims24Provider", p: container.resolve("strims24Provider") },
            { name: "streamFreeProvider", p: container.resolve("streamFreeProvider") },
            { name: "timStreamsProvider", p: container.resolve("timStreamsProvider") },
            { name: "watchFootyProvider", p: container.resolve("watchFootyProvider") },
            { name: "cdnLiveProvider", p: container.resolve("cdnLiveProvider") },
            { name: "streamSports99Provider", p: container.resolve("streamSports99Provider") },
            { name: "streamicProvider", p: container.resolve("streamicProvider") }
        ];

        for (const { name, p } of providers) {
            try {
                console.log(`Checking ${name}...`);
                const matches = await p.getMatches();
                const found = matches.filter(m => m.title && (m.title.toLowerCase().includes("omonia") || m.title.toLowerCase().includes("aradippou")));
                if (found.length > 0) {
                    console.log(`>>> ${name} has ${found.length} matches:`);
                    for (const m of found) {
                        console.log("  Title:", m.title);
                        console.log("  ID:", m.id);
                        console.log("  Date:", m.date, "Status:", m.status);
                        console.log("  Sources:", JSON.stringify(m.sources));
                        
                        // Try resolving streams
                        for (const src of m.sources || []) {
                            console.log(`  Resolving stream for src:`, src);
                            try {
                                const streams = await p.resolveStream(src.id, m.category, m.title, src);
                                console.log(`  Streams found (${streams.length}):`, JSON.stringify(streams, null, 2));
                            } catch (e) {
                                console.log("  Resolve error:", e.message);
                            }
                        }
                    }
                }
            } catch (err) {
                console.log(`Error in ${name}:`, err.message);
            }
        }
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();
