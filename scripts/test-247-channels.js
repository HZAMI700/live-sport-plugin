/**
 * scripts/test-247-channels.js
 * 
 * Audits all 24/7 TV channels across all providers.
 * Validates direct streams, WebRTC streams, and proxies.
 * Run with: npm run test:247
 */

const container = require("../src/container");
const { handleStream } = require("../src/streams");

(async () => {
  console.log("\n🔍 [24/7 Audit] Syncing latest matches and 24/7 channels from all providers...\n");
  const cache = container.resolve("cacheService");
  const aggregator = container.resolve("matchAggregator");
  await aggregator.syncMatches();

  const allMatches = cache.getMatches();
  const channels247 = allMatches.filter(m => m.category === "networks" || !m.date || m.date === "");

  console.log("\n===============================================================");
  console.log("📡 24/7 LIVE CHANNELS HEALTH AUDIT (" + channels247.length + " CHANNELS FOUND)");
  console.log("===============================================================\n");

  let onlineCount = 0;
  let offlineCount = 0;

  for (const ch of channels247) {
    try {
      const streamRes = await handleStream("tv", "nuvio_sport_" + ch.id, {});
      const streamCount = streamRes.streams ? streamRes.streams.length : 0;
      const isOnline = streamCount > 0;

      if (isOnline) onlineCount++;
      else offlineCount++;

      const statusIcon = isOnline ? "🟢 ONLINE " : "🔴 OFFLINE";
      const catTag = ("[" + ch.category.toUpperCase() + "]").padEnd(12);
      const titleStr = ch.title.padEnd(32);

      console.log(statusIcon + " | " + catTag + " " + titleStr + " | Working Streams: " + streamCount);
      
      if (isOnline) {
        streamRes.streams.slice(0, 3).forEach((s, idx) => {
          const qual = s.quality ? "(" + s.quality + ")" : "";
          console.log("    └─ Feed " + (idx + 1) + ": [" + s.name + "] " + s.title.replace(/\n/g, " ") + " " + qual);
        });
      }
    } catch (err) {
      offlineCount++;
      console.log("🔴 ERROR   | [" + ch.category.toUpperCase() + "] " + ch.title + " - " + err.message);
    }
  }

  console.log("\n===============================================================");
  console.log("📊 SUMMARY: " + onlineCount + " Online | " + offlineCount + " Offline | Total: " + channels247.length);
  console.log("===============================================================\n");
  process.exit(0);
})();
