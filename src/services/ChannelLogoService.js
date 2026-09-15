/**
 * ChannelLogoService.js
 *
 * Single source of truth for channel -> logo mapping. Merges the tv-logos
 * GitHub CDN entries with the Wikimedia URLs that used to live in a shadowed
 * local function inside catalog.js (that shadowing made this service dead code).
 *
 * Matching: exact key first, then longest substring wins, so "sky sports cricket"
 * resolves to the cricket logo even though a generic "sky sports" key exists.
 */

const CHANNEL_LOGOS = {
  // Cricket
  "willow": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/willow-us.png",
  "willow cricket": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/willow-us.png",
  "fox cricket": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/australia/fox-sports-au.png",
  "sky sports cricket": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-kingdom/sky-sports-cricket-uk.png",

  // Tennis
  "tennis channel": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/tennis-channel-us.png",

  // F1 & Motorsport
  "sky sports f1": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-kingdom/sky-sports-f1-uk.png",
  "rally tv": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/international/wrc-plus.png",

  // Football / Soccer & Multi-Sport (specific keys first — matching is longest-substring)
  "sky sports main event": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-kingdom/sky-sports-main-event-uk.png",
  "sky sports premier league": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-kingdom/sky-sports-premier-league-uk.png",
  "sky sports football": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-kingdom/sky-sports-football-uk.png",
  "sky sports action": "https://upload.wikimedia.org/wikipedia/en/thumb/5/52/Sky_Sports_Action_2020.svg/512px-Sky_Sports_Action_2020.svg.png",
  "sky sports arena": "https://upload.wikimedia.org/wikipedia/en/thumb/0/00/Sky_Sports_Arena_2020.svg/512px-Sky_Sports_Arena_2020.svg.png",
  "sky sports golf": "https://upload.wikimedia.org/wikipedia/en/thumb/0/02/Sky_Sports_Golf_2020.svg/512px-Sky_Sports_Golf_2020.svg.png",
  "sky sports cricket": "https://upload.wikimedia.org/wikipedia/en/thumb/8/87/Sky_Sports_Cricket_2020.svg/512px-Sky_Sports_Cricket_2020.svg.png",
  "tnt sports 1": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-kingdom/tnt-sports-1-uk.png",
  "tnt sports 2": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-kingdom/tnt-sports-2-uk.png",
  "eurosport 1": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-kingdom/eurosport-1-uk.png",
  "eurosport 2": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-kingdom/eurosport-2-uk.png",
  "bein sports usa": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/bein-sports-us.png",
  "bein sports xtra": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/bein-sports-xtra-us.png",
  "cbs sports network": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/cbs-sports-network-us.png",
  "cbs sports golazo network": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/cbs-sports-golazo-network-us.png",

  // US Major Networks (ESPN, Fox, NBC, Major Leagues)
  "espn": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/espn-us.png",
  "espn 2": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/espn-2-us.png",
  "espn 3": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/espn-3-us.png",
  "espnu": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/espnu-us.png",
  "espnews": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/espnews-us.png",
  "espn8": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/espn-us.png",
  "fox sports 1": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/fox-sports-1-us.png",
  "fox sports 2": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/fox-sports-2-us.png",
  "fox deportes": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/fox-deportes-us.png",
  "fox league": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/australia/fox-sports-au.png",
  "nbc sports now": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/nbc-sports-us.png",
  "nbc sports bay area": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/nbc-sports-bay-area-us.png",
  "nba tv": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/nba-tv-us.png",
  "nfl network": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/nfl-network-us.png",
  "nfl redzone": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/nfl-redzone-us.png",
  "mlb network": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/mlb-network-us.png",
  "mlb strike zone": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/mlb-strike-zone-us.png",
  "nhl network": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/united-states/nhl-network-us.png",
  "fight network": "https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/canada/fight-network-ca.png",

  // Generic / regional catch-alls (Wikimedia) — keep AFTER the specific keys
  "sky sports": "https://upload.wikimedia.org/wikipedia/en/thumb/f/f6/Sky_Sports_2020.svg/512px-Sky_Sports_2020.svg.png",
  "astro cricket": "https://upload.wikimedia.org/wikipedia/en/thumb/0/05/Astro_Cricket_logo.svg/512px-Astro_Cricket_logo.svg.png",
  "astro supersport": "https://upload.wikimedia.org/wikipedia/en/thumb/1/14/Astro_SuperSport_logo.svg/512px-Astro_SuperSport_logo.svg.png",
  "tsn": "https://upload.wikimedia.org/wikipedia/en/thumb/3/30/TSN_Logo_2023.svg/512px-TSN_Logo_2023.svg.png",
  "sportsnet": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Sportsnet_2023_Logo.svg/512px-Sportsnet_2023_Logo.svg.png",
  "bein sports": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/BeIN_SPORTS_2017.svg/512px-BeIN_SPORTS_2017.svg.png",
  "espn": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/ESPN_wordmark.svg/512px-ESPN_wordmark.svg.png",
  "fox sports": "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fe/Fox_Sports_logo.svg/512px-Fox_Sports_logo.svg.png",
  "tnt sports": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/TNT_Sports_%28United_Kingdom%29_logo.svg/512px-TNT_Sports_%28United_Kingdom%29_logo.svg.png",
  "bt sport": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/BT_Sport_logo.svg/512px-BT_Sport_logo.svg.png",
  "eurosport": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/01/Eurosport_logo_2023.svg/512px-Eurosport_logo_2023.svg.png",
  "star sports": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cc/Star_Sports_logo.svg/512px-Star_Sports_logo.svg.png",
  "super sport": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/SuperSport_logo.svg/512px-SuperSport_logo.svg.png",
  "supersport": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/SuperSport_logo.svg/512px-SuperSport_logo.svg.png",
  "ten sports": "https://upload.wikimedia.org/wikipedia/en/thumb/7/77/Ten_Sports_Logo.svg/512px-Ten_Sports_Logo.svg.png",
  "optus": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/Optus_Sport_Logo.svg/512px-Optus_Sport_Logo.svg.png",
  "nbc sports": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/NBC_Sports_logo.svg/512px-NBC_Sports_logo.svg.png",
  "cbs sports": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/31/CBS_Sports_2020.svg/512px-CBS_Sports_2020.svg.png",
  "arena sport": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/Arena_Sport_logo.svg/512px-Arena_Sport_logo.svg.png",
  "digi sport": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Digisport_Romania_logo.svg/512px-Digisport_Romania_logo.svg.png",
  "eleven sports": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Eleven_Sports_logo.svg/512px-Eleven_Sports_logo.svg.png",
  "bally sports": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/28/Bally_Sports_logo.svg/512px-Bally_Sports_logo.svg.png",
  "mlb network": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/MLB_Network_logo.svg/512px-MLB_Network_logo.svg.png",
  "nba tv": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/NBA_TV_logo.svg/512px-NBA_TV_logo.svg.png",
  "nfl network": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/NFL_Network_logo.svg/512px-NFL_Network_logo.svg.png"
};

// Longest keys first so "sky sports cricket" beats the generic "sky sports".
const SORTED_KEYS = Object.entries(CHANNEL_LOGOS).sort((a, b) => b[0].length - a[0].length);

function getChannelLogo(title) {
  if (!title) return null;
  const lower = String(title).toLowerCase().trim();

  // Exact match
  if (CHANNEL_LOGOS[lower]) return CHANNEL_LOGOS[lower];

  // Longest substring match
  for (const [key, logoUrl] of SORTED_KEYS) {
    if (lower.includes(key)) return logoUrl;
  }
  return null;
}

module.exports = {
  getChannelLogo,
  CHANNEL_LOGOS
};
