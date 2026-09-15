class CacheService {
  constructor() {
    this.cachedMatches = [];
    this.lastFetchTime = 0;
    this.CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  }

  getMatches() {
    return this.cachedMatches.map((m) => ({ ...m, sources: [...(m.sources || [])] }));
  }

  setMatches(matches) {
    this.cachedMatches = (matches || []).map((m) => ({ ...m, sources: [...(m.sources || [])] }));
    this.lastFetchTime = Date.now();
  }

  isStale(ttlMs = this.CACHE_TTL) {
    return (Date.now() - this.lastFetchTime) > ttlMs;
  }
}

module.exports = CacheService;
