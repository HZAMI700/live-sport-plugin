const container = require("./src/container.js");
const { fetch } = require("undici");

(async () => {
    const strims = container.resolve("strims24Provider");
    const streams = await strims.resolveStream("FS:lnFc5DJF", "basketball", "Italy - Serbia");
    console.log("Strims24 streams count:", streams.length);
    for (const s of streams) {
        console.log("Checking:", s.title);
        console.log("Proxy URL:", s.url);
        const urlObj = new URL(s.url);
        const raw = urlObj.searchParams.get("url");
        const ref = urlObj.searchParams.get("referer");
        try {
            const res = await fetch(raw, {
                headers: {
                    "User-Agent": "Mozilla/5.0",
                    "Referer": ref || "https://iplayer.is/",
                    "Origin": "https://iplayer.is"
                }
            });
            console.log("Direct status:", res.status);
            const text = await res.text();
            console.log("Valid HLS?", text.includes("#EXTM3U"));
        } catch(e) {
            console.error("Fetch err:", e.message);
        }
    }
})();
