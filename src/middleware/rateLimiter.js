/**
 * rateLimiter.js
 *
 * Lightweight, zero-dependency in-memory rate limiting middleware.
 * Mitigates DoS, rapid scraper loops, and resource exhaustion (OWASP API4:2023).
 */

function getClientIp(req) {
  return (
    req.ip ||
    (req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : null) ||
    req.socket?.remoteAddress ||
    '127.0.0.1'
  );
}

function createRateLimiter({
  windowMs = 60 * 1000,
  max = 120,
  message = 'Too many requests. Please try again later.'
} = {}) {
  const store = new Map(); // ip -> { count, resetTime }
  const MAX_ENTRIES = 5000;

  // Periodic cleanup sweep every 2 minutes
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [ip, data] of store.entries()) {
      if (now >= data.resetTime) {
        store.delete(ip);
      }
    }
  }, 2 * 60 * 1000);

  // Unref timer so it doesn't block process exit or tests
  if (cleanupTimer.unref) {
    cleanupTimer.unref();
  }

  return function rateLimiterMiddleware(req, res, next) {
    const ip = getClientIp(req);
    const now = Date.now();

    let record = store.get(ip);
    if (!record || now >= record.resetTime) {
      // Memory safety cap: evict oldest if size exceeds threshold
      if (store.size >= MAX_ENTRIES) {
        const oldestKey = store.keys().next().value;
        if (oldestKey) store.delete(oldestKey);
      }
      record = { count: 0, resetTime: now + windowMs };
      store.set(ip, record);
    }

    record.count += 1;

    const remaining = Math.max(0, max - record.count);
    const retryAfterSec = Math.ceil((record.resetTime - now) / 1000);

    res.setHeader('RateLimit-Limit', max);
    res.setHeader('RateLimit-Remaining', remaining);
    res.setHeader('RateLimit-Reset', Math.ceil(record.resetTime / 1000));

    if (record.count > max) {
      res.setHeader('Retry-After', retryAfterSec);
      if (req.path.endsWith('.json') || req.path.startsWith('/catalog') || req.path.startsWith('/stream')) {
        return res.status(429).json({ error: message });
      }
      return res.status(429).send(message);
    }

    next();
  };
}

const manifestRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  message: 'Manifest rate limit exceeded. Please wait a moment.'
});

const imageRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 180,
  message: 'Image proxy rate limit exceeded.'
});

const catalogRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 240,
  message: 'Catalog rate limit exceeded.'
});

const streamRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  message: 'Stream endpoint rate limit exceeded.'
});

module.exports = {
  createRateLimiter,
  manifestRateLimiter,
  imageRateLimiter,
  catalogRateLimiter,
  streamRateLimiter,
  getClientIp
};
