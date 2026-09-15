const container = require("./src/container.js");
const { fetch } = require("undici");

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

        console.log("Searching for Dijon vs St Etienne across all providers...\n");
        let totalFound = 0;

        for (const { name, p } of providers) {
            try {
                const matches = await p.getMatches();
                const found = matches.filter(m => {
                    const t = (m.title || "").toLowerCase();
                    return t.includes("dijon") || t.includes("etienne");
                });

                if (found.length > 0) {
                    totalFound += found.length;
                    console.log(`>>> Provider [${name}] found ${found.length} match(es):`);
                    for (const m of found) {
                        console.log("  Title:", m.title);
                        console.log("  Category:", m.category);
                        console.log("  Date:", m.date, "Status:", m.status);
                        console.log("  Sources:", JSON.stringify(m.sources));

                        for (const src of m.sources || []) {
                            try {
                                const streams = await p.resolveStream(src.id, m.category, m.title, src);
                                console.log(`  Resolved ${streams.length} stream(s) for src [${src.source} / ${src.id}]:`);
                                for (const [idx, s] of streams.entries()) {
                                    console.log(`    [${idx + 1}] Title: ${s.title}`);
                                    console.log(`        URL: ${s.url ? s.url.slice(0, 100) + "..." : "External: " + s.externalUrl}`);
                                    if (s.url) {
                                        try {
                                            const urlObj = new URL(s.url);
                                            const raw = urlObj.searchParams.get("url") || s.url;
                                            const ref = urlObj.searchParams.get("referer") || (s.behaviorHints && s.behaviorHints.proxyHeaders && s.behaviorHints.proxyHeaders.request && s.behaviorHints.proxyHeaders.request.Referer) || "";
                                            const hRes = await fetch(raw, {
                                                headers: {
                                                    "User-Agent": "Mozilla/5.0",
                                                    ...(ref ? { "Referer": ref, "Origin": new URL(ref).origin } : {})
                                                },
                                                signal: AbortSignal.timeout(4000)
                                            });
                                            const text = await hRes.text();
                                            console.log(`        Health check: HTTP ${hRes.status} | HLS: ${text.includes("#EXTM3U")}`);
                                        } catch (err) {
                                            console.log(`        Health check failed: ${err.message}`);
                                        }
                                    }
                                }
                            } catch (err) {
                                console.log(`  Resolve error for src ${src.id}:`, err.message);
                            }
                        }
                    }
                }
            } catch (err) {
                console.log(`Error checking ${name}:`, err.message);
            }
        }

        if (totalFound === 0) {
            console.log("No active match found for Dijon - St Etienne right now across all scrapers.");
        }
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
})();
