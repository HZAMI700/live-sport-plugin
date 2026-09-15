const { fetch } = require("undici");

(async () => {
    const rawUrl = "https://netanjahu.hls.st/t/0e8648039a5bd6910d677824e8ff289e/index.m3u8";
    const proxyUrl = "http://localhost:7000/api/manifest?url=" + encodeURIComponent(rawUrl) + "&referer=" + encodeURIComponent("https://iplayer.is/") + "&origin=" + encodeURIComponent("https://iplayer.is");

    console.log("=== Testing Direct Upstream ===");
    try {
        const res = await fetch(rawUrl, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                "Referer": "https://iplayer.is/",
                "Origin": "https://iplayer.is"
            }
        });
        console.log("Direct Upstream Status:", res.status, res.statusText);
        const text = await res.text();
        console.log("Direct Upstream Body (first 300 chars):", text.slice(0, 300));
    } catch (e) {
        console.error("Direct Upstream Error:", e.message);
    }

    console.log("\n=== Testing Local Proxy Manifest Endpoint ===");
    try {
        const res2 = await fetch(proxyUrl);
        console.log("Local Proxy Status:", res2.status, res2.statusText);
        const text2 = await res2.text();
        console.log("Local Proxy Body (first 300 chars):", text2.slice(0, 300));
    } catch (e) {
        console.error("Local Proxy Error:", e.message);
    }
})();
