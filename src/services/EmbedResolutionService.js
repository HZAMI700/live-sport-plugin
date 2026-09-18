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

// SSRF Guard: reject private IP ranges & loopback addresses
function isPrivateOrReservedHost(hostname) {
  if (!hostname || typeof hostname !== 'string') return true;
  const h = hostname.toLowerCase().trim();

  // Localhost and loopbacks
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0') return true;

  // Cloud metadata endpoint
  if (h === '169.254.169.254' || h.startsWith('169.254.')) return true;

  // IPv4 private ranges (RFC 1918)
  // 10.0.0.0/8
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  // 172.16.0.0/12
  const m172 = h.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (m172) {
    const oct = parseInt(m172[1], 10);
    if (oct >= 16 && oct <= 31) return true;
  }
  // 192.168/16
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;

  // IPv6 unique local and link local
  if (h.startsWith('fc00:') || h.startsWith('fd00:') || h.startsWith('fe80:')) return true;

  // Must have a valid domain format or valid public IP
  if (!h.includes('.') && !h.includes(':')) return true;

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
