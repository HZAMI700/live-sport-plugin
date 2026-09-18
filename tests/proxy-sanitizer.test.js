const HtmlSanitizerService = require('../src/services/HtmlSanitizerService');
const EmbedResolutionService = require('../src/services/EmbedResolutionService');
const { isPrivateOrReservedHost } = require('../src/services/EmbedResolutionService');

describe('HtmlSanitizerService', () => {
  let sanitizer;

  beforeEach(() => {
    sanitizer = new HtmlSanitizerService();
  });

  test('strips known ad network scripts', () => {
    const inputHtml = `
      <html>
        <head>
          <script src="https://popads.net/pop.js"></script>
          <script src="https://adsterra.com/tag.js"></script>
          <script src="https://propellerads.com/zone.js"></script>
          <script src="https://monetag.com/push.js"></script>
        </head>
        <body>
          <div id="player"></div>
        </body>
      </html>
    `;
    const clean = sanitizer.sanitizePlayerHtml(inputHtml, 'https://upstream-stream.com/watch/123');
    expect(clean).not.toContain('popads.net');
    expect(clean).not.toContain('adsterra.com');
    expect(clean).not.toContain('propellerads.com');
    expect(clean).not.toContain('monetag.com');
    expect(clean).toContain('[StreamGuard] Stripped ad network script');
  });

  test('preserves legitimate player libraries and player configurations', () => {
    const inputHtml = `
      <html>
        <head>
          <script src="https://cdn.jsdelivr.net/npm/clappr@latest/dist/clappr.min.js"></script>
          <script src="https://vjs.zencdn.net/8.0.4/video.min.js"></script>
          <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
          <script>
            var player = new Clappr.Player({
              source: "https://cdn.example.com/hls/live.m3u8",
              parentId: "#player"
            });
          </script>
        </head>
        <body>
          <div id="player"></div>
        </body>
      </html>
    `;
    const clean = sanitizer.sanitizePlayerHtml(inputHtml, 'https://upstream-stream.com/embed/123');
    expect(clean).toContain('clappr.min.js');
    expect(clean).toContain('video.min.js');
    expect(clean).toContain('hls.js');
    expect(clean).toContain('Clappr.Player');
    expect(clean).toContain('https://cdn.example.com/hls/live.m3u8');
  });

  test('injects <base href="..."> and anti-sandbox defusal shim', () => {
    const inputHtml = `<html><head><title>Stream</title></head><body></body></html>`;
    const clean = sanitizer.sanitizePlayerHtml(inputHtml, 'https://upstream-stream.com/embed/123');
    expect(clean).toContain('<base href="https://upstream-stream.com/">');
    expect(clean).toContain('nuvio-stream-guard');
    expect(clean).toContain('dummyWindow');
    expect(clean).toContain('[StreamGuard] Defused popup/popunder');
  });
});

describe('EmbedResolutionService SSRF Guard', () => {
  let resolver;

  beforeEach(() => {
    resolver = new EmbedResolutionService();
  });

  test('blocks private IPv4 and loopback addresses', () => {
    expect(isPrivateOrReservedHost('localhost')).toBe(true);
    expect(isPrivateOrReservedHost('127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedHost('10.0.0.1')).toBe(true);
    expect(isPrivateOrReservedHost('192.168.1.1')).toBe(true);
    expect(isPrivateOrReservedHost('172.16.0.1')).toBe(true);
    expect(isPrivateOrReservedHost('172.31.255.255')).toBe(true);
    expect(isPrivateOrReservedHost('169.254.169.254')).toBe(true);
    expect(isPrivateOrReservedHost('::1')).toBe(true);
  });

  test('allows legitimate public streaming domains', () => {
    expect(isPrivateOrReservedHost('embed.st')).toBe(false);
    expect(isPrivateOrReservedHost('embedindia.st')).toBe(false);
    expect(isPrivateOrReservedHost('streamed.pk')).toBe(false);
    expect(isPrivateOrReservedHost('watchfooty.st')).toBe(false);
  });

  test('validateUrl rejects non-http protocols and private hosts', () => {
    expect(resolver.validateUrl('file:///etc/passwd').valid).toBe(false);
    expect(resolver.validateUrl('javascript:alert(1)').valid).toBe(false);
    expect(resolver.validateUrl('http://127.0.0.1:8080/admin').valid).toBe(false);
    expect(resolver.validateUrl('http://169.254.169.254/latest/meta-data').valid).toBe(false);
    expect(resolver.validateUrl('https://embed.st/embed/admin/123').valid).toBe(true);
  });
});
