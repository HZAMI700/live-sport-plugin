/**
 * HtmlSanitizerService.js
 *
 * Robust HTML sanitizer for sports streaming embed pages.
 * 
 * Objectives:
 *  1. Eliminate popup, pop-under, ad network, and tracker scripts.
 *  2. Defuse anti-sandbox tripwires by shimming window.open with a functional dummy window object.
 *  3. Inject <base href="..."> so relative player assets (CSS, JS, skins, fonts) resolve properly.
 *  4. Strictly preserve legitimate video players (VideoJS, JW Player, Clappr, HLS.js, Dash.js, Shaka, Plyr)
 *     and stream initialization data/tokens.
 */

const KNOWN_AD_DOMAINS = [
  'popads', 'adsterra', 'exoclick', 'propellerads', 'monetag', 'hilltopads',
  'clickadu', 'alwingulla', 'trafficjunky', 'juicyads', 'coinhive', 'syndication',
  'outbrain', 'taboola', 'doubleclick', 'popcash', 'adcash', 'admaven', 'adx',
  'adtrue', 'realsrv', 'richaudience', 'googlesyndication', 'adnxs', 'smartadserver',
  'bidgear', 'adsco.re', 'yadro.ru', 'onclickmega', 'mgid', 'infolinks', 'zergnet',
  'adform', 'bidswitch', 'openx', 'rubiconproject', 'criteo', 'pubmatic',
  'scorecardresearch', 'betting', 'partnerize', 'adlightning', 'affil'
];

const LEGIT_PLAYER_PATTERNS = [
  /video\.js/i, /videojs/i, /jwplayer/i, /clappr/i, /hls(?:\.min|\.light)?\.js/i,
  /dash(?:\.all)?\.js/i, /shaka-player/i, /plyr/i, /artplayer/i, /flowplayer/i
];

class HtmlSanitizerService {
  constructor() {
    this.adPatternRegex = new RegExp(
      `<script[^>]*src=["'][^"']*(${KNOWN_AD_DOMAINS.join('|')})[^"']*["'][^>]*>\\s*<\\/script>`,
      'gi'
    );
  }

  /**
   * Determine if a script src is a verified video player runtime library.
   * @param {string} src
   * @returns {boolean}
   */
  isLegitimatePlayerScript(src) {
    if (!src || typeof src !== 'string') return false;
    return LEGIT_PLAYER_PATTERNS.some(p => p.test(src));
  }

  /**
   * Sanitize upstream embed HTML for safe, ad-free rendering inside an iframe.
   *
   * @param {string} html Raw HTML from upstream
   * @param {string} upstreamUrl URL of the upstream page (for <base href="...">)
   * @returns {string} Sanitized HTML
   */
  sanitizePlayerHtml(html, upstreamUrl) {
    if (!html || typeof html !== 'string') return '';
    let clean = html;

    let upstreamOrigin = '';
    try {
      const parsed = new URL(upstreamUrl);
      upstreamOrigin = parsed.origin;
    } catch (_) {}

    // 1. Strip script tags pointing to known ad / popunder / tracking networks
    clean = clean.replace(this.adPatternRegex, '<!-- [StreamGuard] Stripped ad network script -->');

    // 2. Strip standalone inline ad network calls like popns, ad_tag, etc.
    clean = clean.replace(/<script[^>]*>[^<]*?(?:popunder|popads|propeller|adsterra)[^<]*?<\/script>/gi, (match) => {
      // If it mentions a player setup, preserve it!
      if (/player|video|source|hls|m3u8/i.test(match)) {
        return match;
      }
      return '<!-- [StreamGuard] Stripped inline ad block -->';
    });

    // 3. Strip meta refresh redirect attempts
    clean = clean.replace(/<meta[^>]*http-equiv=["']?refresh["']?[^>]*>/gi, '');

    // 4. Inject <base href="..."> if upstreamOrigin exists and <base> isn't present
    if (upstreamOrigin && !clean.includes('<base ') && !clean.includes('<base>')) {
      const baseTag = `<base href="${upstreamOrigin}/">\n`;
      if (clean.includes('<head>')) {
        clean = clean.replace('<head>', `<head>\n${baseTag}`);
      } else if (clean.includes('<head ')) {
        clean = clean.replace(/<head[^>]*>/i, (m) => `${m}\n${baseTag}`);
      } else {
        clean = baseTag + clean;
      }
    }

    // 5. Inject Anti-Sandbox Bypass & Pop-Under Defusal Shim early in <head>
    const guardScript = `
<!-- 🛡️ NUVIO STREAM GUARD: Anti-Sandbox Defusal & Pop-Under Neutralizer -->
<script id="nuvio-stream-guard">
(function() {
  'use strict';

  // 1. Truthy Window Proxy for window.open
  // Upstream anti-sandbox checks call window.open(...) and test if returned window is truthy & not closed.
  // By returning a functional dummy window object, the test passes smoothly without throwing DOMException
  // and completely defuses "Remove sandbox" warnings!
  var dummyWindow = {
    closed: false,
    opener: window,
    name: '',
    focus: function() {},
    blur: function() {},
    close: function() { this.closed = true; },
    postMessage: function() {},
    location: {
      href: 'about:blank',
      replace: function() {},
      assign: function() {},
      reload: function() {}
    },
    document: {
      write: function() {},
      writeln: function() {},
      close: function() {},
      open: function() {}
    }
  };

  try {
    Object.defineProperty(window, 'open', {
      value: function(url, target, features) {
        console.log('[StreamGuard] Defused popup/popunder to:', url || 'about:blank');
        return dummyWindow;
      },
      writable: true,
      configurable: true
    });
  } catch (e) {
    window.open = function() { return dummyWindow; };
  }

  // 2. Protect dialogs and frame context
  try {
    window.alert = function() {};
    window.confirm = function() { return false; };
    window.prompt = function() { return null; };
    window.onbeforeunload = null;
  } catch (_) {}

  // 3. Defuse clickjacking and ad navigation in capture phase
  document.addEventListener('click', function(e) {
    var el = e.target;
    while (el && el !== document.body && el !== document.documentElement) {
      if (el.tagName === 'A') {
        var href = el.getAttribute('href') || '';
        if (el.target === '_blank' || href.indexOf('javascript:window.open') !== -1 ||
            (href.indexOf('http') === 0 && !href.includes(window.location.hostname))) {
          e.preventDefault();
          e.stopPropagation();
          console.log('[StreamGuard] Intercepted ad redirect to:', href);
          return false;
        }
      }
      el = el.parentElement;
    }
  }, true);

  // 4. Dynamic removal of injected anti-sandbox / adblock banners and overlays
  function cleanDom() {
    var banners = document.querySelectorAll(
      '[id*="sandbox"], [class*="sandbox"], [id*="adblock"], [class*="adblock"], .ad-notice, #ad-notice'
    );
    banners.forEach(function(b) {
      var text = (b.textContent || '').toLowerCase();
      if (text.includes('sandbox') || text.includes('adblock') || text.includes('disable')) {
        b.remove();
        console.log('[StreamGuard] Removed sandbox warning element');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', cleanDom);
  } else {
    cleanDom();
  }

  var observer = new MutationObserver(function(mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i];
      for (var j = 0; j < m.addedNodes.length; j++) {
        var node = m.addedNodes[j];
        if (node.nodeType === 1) {
          var tag = (node.tagName || '').toLowerCase();
          var text = (node.textContent || '').toLowerCase();
          if (text.includes('remove sandbox') || text.includes('sandbox attribute')) {
            node.remove();
            console.log('[StreamGuard] Suppressed "Remove sandbox" message');
            continue;
          }
          if (tag === 'iframe' && node.id !== 'player' && node.id !== 'video') {
            var src = (node.src || '').toLowerCase();
            if (src.includes('pop') || src.includes('ad') || src.includes('banner')) {
              node.remove();
            }
          }
        }
      }
    }
  });

  if (document.documentElement) {
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
</script>
<style id="nuvio-stream-guard-css">
  [id*="sandbox"], [class*="sandbox"], [id*="adblock"], [class*="adblock"],
  .ad-notice, #ad-notice, .pop-overlay, #pop-overlay {
    display: none !important;
    pointer-events: none !important;
    visibility: hidden !important;
  }
</style>
`;

    if (clean.includes('<head>')) {
      clean = clean.replace('<head>', `<head>\n${guardScript}`);
    } else if (clean.includes('<head ')) {
      clean = clean.replace(/<head[^>]*>/i, (m) => `${m}\n${guardScript}`);
    } else {
      clean = guardScript + clean;
    }

    return clean;
  }
}

module.exports = HtmlSanitizerService;
