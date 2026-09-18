/**
 * EmbedResolutionService.js
 *
 * Server-side resolver for sports embed streams.
 *
 * Workflow:
 *  1. SSRF validation (blocks localhost, private RFC-1918 IPs, AWS metadata, etc.)
 *  2. Server-side fetch via _safeFetch (TLS fingerprint + browser User-Agent)
 *  3. EmbedExtractorChain (Pattern A, D, E, B, C)
 *  4. Direct HLS resolution (/api/manifest?url=...) OR
 *     Clean Player fallback (/api/clean-player?url=...)
 */

const { safeFetch: _safeFetch } = require('../impitClient');
const EmbedExtractorChain = require('./EmbedExtractorChain');
const StreamEntity = require('../domain/StreamEntity');
const { BASE_URL } = require('../config');

// SSRF Guard: reject private IP ranges, loopback addresses, CGNAT, metadata & reserved hosts
function isPrivateOrReservedHost(hostname) {
  if (!hostname || typeof hostname !== 'string') return true;
  let h = hostname.toLowerCase().trim();

  // Strip IPv6 enclosing brackets e.g. [::1] -> ::1
  if (h.startsWith('[') && h.endsWith(']')) {
    h = h.slice(1, -1);
  }

  // Localhost & single-label hostnames
  if (h === 'localhost' || h === '0.0.0.0') return true;

  // Prohibited internal and local domain extensions
  if (
    h.endsWith('.localhost') ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    h.endsWith('.lan') ||
    h.endsWith('.home') ||
    h.endsWith('.arpa') ||
    h.endsWith('.invalid')
  ) {
    return true;
  }

  // IPv6 checks
  if (h.includes(':')) {
    // Unspecified & loopback
    if (h === '::1' || h === '::' || /^0+(?::0+)*:0*1$/.test(h)) return true;

    // Unique Local (fc00::/7)
    if (h.startsWith('fc') || h.startsWith('fd')) return true;

    // Link Local (fe80::/10 -> fe8, fe9, fea, feb)
    if (/^fe[89ab]/i.test(h)) return true;

    // Multicast (ff00::/8)
    if (h.startsWith('ff')) return true;

    // Documentation (2001:db8::/32)
    if (h.startsWith('2001:db8:') || h.startsWith('2001:0db8:')) return true;

    // IPv4-mapped IPv6 (::ffff:192.168.1.1 or ::ffff:7f00:1)
    if (h.startsWith('::ffff:')) {
      const mapped = h.replace('::ffff:', '');
      return isPrivateOrReservedHost(mapped);
    }

    return false;
  }

  // Non-IPv6 hostnames: must contain at least one dot (prevent intranet single-word hosts like 'database', 'metadata')
  if (!h.includes('.')) return true;

  // Check if it's an IP address or contains numeric/hex segments
  // Normal IPv4 has 4 decimal octets: d.d.d.d
  const ipv4Match = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const octets = [
      parseInt(ipv4Match[1], 10),
      parseInt(ipv4Match[2], 10),
      parseInt(ipv4Match[3], 10),
      parseInt(ipv4Match[4], 10)
    ];

    // Check octet bounds (0-255) and reject octal with leading zeroes (e.g. 0177)
    for (let i = 1; i <= 4; i++) {
      const raw = ipv4Match[i];
      if (raw.length > 1 && raw.startsWith('0')) return true; // Octal attempt
      if (octets[i - 1] > 255) return true;
    }

    const [a, b, c, d] = octets;

    // 0.0.0.0/8 (Current network)
    if (a === 0) return true;

    // 10.0.0.0/8 (Private RFC 1918)
    if (a === 10) return true;

    // 100.64.0.0/10 (Shared Address Space / CGNAT RFC 6598: 100.64.0.0 - 100.127.255.255)
    if (a === 100 && b >= 64 && b <= 127) return true;

    // 127.0.0.0/8 (Loopback)
    if (a === 127) return true;

    // 169.254.0.0/16 (Link Local & Cloud Metadata RFC 3927)
    if (a === 169 && b === 254) return true;

    // 172.16.0.0/12 (Private RFC 1918: 172.16.0.0 - 172.31.255.255)
    if (a === 172 && b >= 16 && b <= 31) return true;

    // 192.0.0.0/24 (IETF Protocol Assignments)
    if (a === 192 && b === 0 && c === 0) return true;

    // 192.0.2.0/24 (Documentation TEST-NET-1 RFC 5737)
    if (a === 192 && b === 0 && c === 2) return true;

    // 192.168/16 (Private RFC 1918)
    if (a === 192 && b === 168) return true;

    // 198.18.0.0/15 (Benchmarking RFC 2544: 198.18.0.0 - 198.19.255.255)
    if (a === 198 && (b === 18 || b === 19)) return true;

    // 198.51.100.0/24 (Documentation TEST-NET-2 RFC 5737)
    if (a === 198 && b === 51 && c === 100) return true;

    // 203.0.113.0/24 (Documentation TEST-NET-3 RFC 5737)
    if (a === 203 && b === 0 && c === 113) return true;

    // 224.0.0.0/4 (Multicast RFC 5771) & 240.0.0.0/4 (Reserved / Broadcast 255.255.255.255)
    if (a >= 224) return true;

    return false;
  }

  // Reject alternative IP representations:
  // e.g. hexadecimal (0x7f000001), octal, shortened IPs (127.1), pure integer IPs (2130706433)
  // If the last label is purely numeric or hex, it is an invalid domain or non-canonical IP
  const labels = h.split('.');
  const lastLabel = labels[labels.length - 1];
  if (/^(?:\d+|0x[0-9a-f]+)$/i.test(lastLabel)) {
    return true; // Not a valid domain TLD and not a standard 4-octet IPv4
  }

  // Reject labels with hex prefix or invalid domain characters
  if (labels.some(l => /^0x/i.test(l) || !/^[a-z0-9_-]+$/i.test(l))) {
    return true;
  }

  return false;
}

class EmbedResolutionService {
  constructor(opts = {}) {
    this.streamResolveCache = opts.streamResolveCache;
    this.extractionCache = new Map();
    this.CACHE_TTL_MS = 60 * 1000; // 1 minute memory cache for extraction
  }

  /**
   * Validate that a target URL is safe against SSRF attacks.
   * @param {string} rawUrl
   * @returns {{ valid: boolean, url?: URL, error?: string }}
   */
  validateUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') {
      return { valid: false, error: 'Empty or non-string URL' };
    }
    let parsed;
    try {
      let decoded = rawUrl;
      try {
        if (decoded.includes('%')) decoded = decodeURIComponent(decoded);
      } catch (_) {}
      parsed = new URL(decoded);
    } catch (_) {
      return { valid: false, error: 'Invalid URL syntax' };
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, error: 'Invalid protocol: only HTTP and HTTPS allowed' };
    }

    if (isPrivateOrReservedHost(parsed.hostname)) {
      return { valid: false, error: `Access to host ${parsed.hostname} is prohibited (SSRF guard)` };
    }

    return { valid: true, url: parsed };
  }

  /**
   * Attempt server-side extraction of a direct M3U8 stream from an embed page.
   *
   * @param {string} embedUrl Upstream embed URL
   * @param {string} referer Referer header for upstream
   * @param {string} hint Optional provider hint
   * @returns {Promise<{ m3u8Url: string, pattern: string } | null>}
   */
  async extractDirectM3u8(embedUrl, referer = '', hint = '') {
    const val = this.validateUrl(embedUrl);
    if (!val.valid) {
      console.warn(`[EmbedResolution] URL rejected: ${val.error}`);
      return null;
    }

    const cacheKey = `m3u8:${val.url.href}`;
    const cached = this.extractionCache.get(cacheKey);
    if (cached && Date.now() - cached.time < this.CACHE_TTL_MS) {
      return cached.data;
    }

    try {
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      };
      if (referer) headers['Referer'] = referer;
      else headers['Referer'] = val.url.origin + '/';

      const res = await _safeFetch(val.url.href, {
        headers,
        timeoutMs: 5000
      });

      if (!res.ok) {
        console.warn(`[EmbedResolution] Upstream HTTP ${res.status} for ${val.url.hostname}`);
        return null;
      }

      const html = await res.text();

      // 1. Run EmbedExtractorChain
      const result = EmbedExtractorChain.extract(html, hint);
      if (result && result.url) {
        console.log(`[EmbedResolution] Extracted M3U8 via ${result.pattern}: ${result.url.slice(0, 80)}...`);
        const data = { m3u8Url: result.url, pattern: result.pattern };
        this.extractionCache.set(cacheKey, { time: Date.now(), data });
        return data;
      }

      // 2. Check for iframe redirect (e.g. embed.st pointing to embedindia.st)
      const iframeMatches = html.match(/<iframe[^>]*\ssrc=["']([^"']+)["']/gi);
      if (iframeMatches) {
        for (const m of iframeMatches) {
          const srcMatch = m.match(/src=["'](https?:\/\/[^"']+)["']/i);
          if (srcMatch && srcMatch[1]) {
            const nestedUrl = srcMatch[1];
            if (nestedUrl !== embedUrl && !nestedUrl.includes('ads') && !nestedUrl.includes('banner')) {
              console.log(`[EmbedResolution] Following iframe redirect -> ${nestedUrl}`);
              const nestedResult = await this.extractDirectM3u8(nestedUrl, val.url.href, hint);
              if (nestedResult) {
                this.extractionCache.set(cacheKey, { time: Date.now(), data: nestedResult });
                return nestedResult;
              }
            }
          }
        }
      }

      this.extractionCache.set(cacheKey, { time: Date.now(), data: null });
    } catch (err) {
      console.warn(`[EmbedResolution] Extraction failed for ${val.url.hostname}: ${err.message}`);
    }

    return null;
  }

  /**
   * Resolve an embed URL into a StreamEntity:
   *  - Prioritizes Direct HLS (/api/manifest?url=...) if extraction succeeds.
   *  - Otherwise yields Sanitized Clean Player (/api/clean-player?url=...).
   *
   * @param {string} embedUrl
   * @param {string} matchTitle
   * @param {object} options
   * @returns {Promise<StreamEntity>}
   */
  async resolveToStreamEntity(embedUrl, matchTitle, options = {}) {
    const val = this.validateUrl(embedUrl);
    if (!val.valid) {
      return null;
    }

    const providerName = options.providerName || 'Live Stream';
    const referer = options.referer || `${val.url.origin}/`;
    const origin = val.url.origin;

    // 1. Try server-side extraction first (M3U8 / Direct HLS)
    const extraction = await this.extractDirectM3u8(val.url.href, referer, options.hint || '');
    if (extraction && extraction.m3u8Url) {
      const proxyUrl = `/api/manifest?url=${encodeURIComponent(extraction.m3u8Url)}&referer=${encodeURIComponent(referer)}&origin=${encodeURIComponent(origin)}`;
      return new StreamEntity({
        name: providerName,
        title: `${matchTitle || 'Live Sports'} (⚡ Direct HLS)`,
        url: proxyUrl,
        resolution: options.resolution || 'HD',
        behaviorHints: {
          notWebReady: true,
          proxyHeaders: {
            request: {
              "Referer": referer,
              "Origin": origin
            }
          }
        }
      });
    }

    // 2. Fallback to Sanitized Clean Player Proxy (Never loads raw ad-infested site directly)
    const cleanPlayerUrl = `/api/clean-player?url=${encodeURIComponent(val.url.href)}&title=${encodeURIComponent(matchTitle || 'Live Sports')}`;
    return new StreamEntity({
      name: providerName,
      title: `${matchTitle || 'Live Sports'} (🌐 Clean Player)`,
      externalUrl: cleanPlayerUrl,
      resolution: options.resolution || 'Auto',
      behaviorHints: {
        notWebReady: false
      }
    });
  }
}

module.exports = EmbedResolutionService;
module.exports.isPrivateOrReservedHost = isPrivateOrReservedHost;
