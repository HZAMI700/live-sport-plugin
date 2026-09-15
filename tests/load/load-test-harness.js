/**
 * tests/load/load-test-harness.js
 *
 * High-performance asynchronous HTTP load test harness & statistical calculator:
 * - High-concurrency async HTTP client engine using Node built-in / undici
 * - Concurrency pool & burst executors (worker queues, simultaneous thundering herds, duration-based load)
 * - Microsecond/millisecond latency recording via performance.now()
 * - Statistical distribution calculator: Min, Mean, Median (P50), P90, P95, P99, Max, StdDev, Throughput, Error Rate, Status Codes
 * - Header and custom validator aggregation (Cache HIT/MISS ratios, payload inspection)
 */

const { performance } = require('perf_hooks');
const { request, Agent, setGlobalDispatcher } = require('undici');

// Setup global high-concurrency connection pool
const loadAgent = new Agent({
  connections: 500,
  pipelining: 1,
  keepAliveTimeout: 30000,
  connect: {
    timeout: 10000
  }
});
setGlobalDispatcher(loadAgent);

/**
 * Computes statistical percentiles, throughput, and error metrics from an array of latencies.
 */
function calculateStats(latencies, totalDurationMs, statusCodeCounts = {}, errors = [], customMetrics = {}) {
  const count = latencies.length;
  const errorCount = errors.length;
  const successCount = count - errorCount;
  const totalDurationSec = Math.max(totalDurationMs / 1000, 0.001);
  const throughput = Math.round((count / totalDurationSec) * 100) / 100;
  const errorRate = count > 0 ? Math.round((errorCount / count) * 10000) / 100 : 0;

  if (count === 0) {
    return {
      totalRequests: 0,
      successRequests: 0,
      failedRequests: 0,
      errorRatePct: 0,
      throughputRps: 0,
      minMs: 0,
      meanMs: 0,
      medianMs: 0,
      p90Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
      maxMs: 0,
      stdDevMs: 0,
      statusCodes: statusCodeCounts,
      customMetrics
    };
  }

  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, val) => acc + val, 0);
  const mean = Math.round((sum / count) * 100) / 100;

  const min = Math.round(sorted[0] * 100) / 100;
  const max = Math.round(sorted[count - 1] * 100) / 100;

  function getPercentile(p) {
    if (count === 1) return sorted[0];
    const index = (p / 100) * (count - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;
    if (lower === upper) return sorted[lower];
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  }

  const median = Math.round(getPercentile(50) * 100) / 100;
  const p90 = Math.round(getPercentile(90) * 100) / 100;
  const p95 = Math.round(getPercentile(95) * 100) / 100;
  const p99 = Math.round(getPercentile(99) * 100) / 100;

  const squareDiffs = sorted.map((value) => Math.pow(value - mean, 2));
  const avgSquareDiff = squareDiffs.reduce((acc, val) => acc + val, 0) / count;
  const stdDev = Math.round(Math.sqrt(avgSquareDiff) * 100) / 100;

  return {
    totalRequests: count,
    successRequests: successCount,
    failedRequests: errorCount,
    errorRatePct: errorRate,
    throughputRps: throughput,
    totalDurationMs: Math.round(totalDurationMs * 100) / 100,
    minMs: min,
    meanMs: mean,
    medianMs: median,
    p90Ms: p90,
    p95Ms: p95,
    p99Ms: p99,
    maxMs: max,
    stdDevMs: stdDev,
    statusCodes: statusCodeCounts,
    customMetrics
  };
}

/**
 * Single HTTP request executor with timing and validation.
 */
async function executeSingleRequest(options, requestIndex = 0) {
  const {
    url,
    method = 'GET',
    headers = {},
    body = null,
    timeoutMs = 15000,
    validateFn = null
  } = options;

  const targetUrl = typeof url === 'function' ? url(requestIndex) : url;
  const targetHeaders = typeof headers === 'function' ? headers(requestIndex) : headers;
  const targetBody = typeof body === 'function' ? body(requestIndex) : body;

  const tStart = performance.now();
  let statusCode = 0;
  let responseHeaders = {};
  let responseBody = null;
  let error = null;
  let isSuccess = false;
  let customResult = null;

  try {
    const res = await request(targetUrl, {
      method,
      headers: targetHeaders,
      body: targetBody,
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs
    });

    statusCode = res.statusCode;
    responseHeaders = res.headers;
    const rawBody = await res.body.text();

    try {
      responseBody = JSON.parse(rawBody);
    } catch (_) {
      responseBody = rawBody;
    }

    if (typeof validateFn === 'function') {
      const validation = await validateFn({
        statusCode,
        headers: responseHeaders,
        body: responseBody,
        requestIndex
      });

      if (validation === true) {
        isSuccess = true;
      } else if (validation === false) {
        isSuccess = false;
        error = new Error(`Validation failed for request #${requestIndex} (Status ${statusCode})`);
      } else if (validation && typeof validation === 'object') {
        isSuccess = validation.success !== false;
        if (!isSuccess) {
          error = new Error(validation.error || `Validation failed for request #${requestIndex}`);
        }
        customResult = validation.data || null;
      } else {
        isSuccess = statusCode >= 200 && statusCode < 400;
      }
    } else {
      isSuccess = statusCode >= 200 && statusCode < 400;
      if (!isSuccess) {
        error = new Error(`HTTP Error Status ${statusCode}`);
      }
    }
  } catch (err) {
    isSuccess = false;
    error = err;
  }

  const tEnd = performance.now();
  const durationMs = tEnd - tStart;

  return {
    requestIndex,
    url: targetUrl,
    statusCode,
    durationMs,
    isSuccess,
    error,
    headers: responseHeaders,
    body: responseBody,
    customResult
  };
}

/**
 * Runs a fixed number of requests across a concurrent worker pool.
 */
async function runConcurrentRequests(config) {
  const {
    concurrency = 20,
    totalRequests = 100,
    ...requestOptions
  } = config;

  const latencies = [];
  const statusCodes = {};
  const errors = [];
  const customDataList = [];

  let nextIndex = 0;
  const tOverallStart = performance.now();

  async function worker() {
    while (true) {
      const idx = nextIndex++;
      if (idx >= totalRequests) break;

      const result = await executeSingleRequest(requestOptions, idx);
      latencies.push(result.durationMs);

      const codeStr = String(result.statusCode || 'ERR');
      statusCodes[codeStr] = (statusCodes[codeStr] || 0) + 1;

      if (!result.isSuccess || result.error) {
        errors.push({
          index: idx,
          url: result.url,
          statusCode: result.statusCode,
          error: result.error ? result.error.message : 'Unknown error'
        });
      }

      if (result.customResult !== null && result.customResult !== undefined) {
        customDataList.push(result.customResult);
      }
    }
  }

  const workerCount = Math.min(concurrency, totalRequests);
  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);

  const tOverallEnd = performance.now();
  const totalDurationMs = tOverallEnd - tOverallStart;

  let customMetrics = {};
  if (typeof config.aggregateCustomData === 'function') {
    customMetrics = config.aggregateCustomData(customDataList);
  }

  return calculateStats(latencies, totalDurationMs, statusCodes, errors, customMetrics);
}

/**
 * Executes a burst of N requests simultaneously (fired in the exact same tick via Promise.all).
 * Ideal for Single-Flight / Thundering Herd stress tests.
 */
async function runBurstRequests(config) {
  const {
    count = 50,
    ...requestOptions
  } = config;

  const tOverallStart = performance.now();
  const promises = Array.from({ length: count }, (_, idx) =>
    executeSingleRequest(requestOptions, idx)
  );

  const results = await Promise.all(promises);
  const tOverallEnd = performance.now();
  const totalDurationMs = tOverallEnd - tOverallStart;

  const latencies = [];
  const statusCodes = {};
  const errors = [];
  const customDataList = [];

  for (const r of results) {
    latencies.push(r.durationMs);
    const codeStr = String(r.statusCode || 'ERR');
    statusCodes[codeStr] = (statusCodes[codeStr] || 0) + 1;

    if (!r.isSuccess || r.error) {
      errors.push({
        index: r.requestIndex,
        url: r.url,
        statusCode: r.statusCode,
        error: r.error ? r.error.message : 'Unknown error'
      });
    }

    if (r.customResult !== null && r.customResult !== undefined) {
      customDataList.push(r.customResult);
    }
  }

  let customMetrics = {};
  if (typeof config.aggregateCustomData === 'function') {
    customMetrics = config.aggregateCustomData(customDataList);
  }

  return {
    ...calculateStats(latencies, totalDurationMs, statusCodes, errors, customMetrics),
    rawResults: results
  };
}

/**
 * Executes load for a fixed duration of time (seconds) at a specified concurrency level.
 */
async function runDurationLoad(config) {
  const {
    concurrency = 20,
    durationSec = 5,
    ...requestOptions
  } = config;

  const latencies = [];
  const statusCodes = {};
  const errors = [];
  const customDataList = [];

  const tOverallStart = performance.now();
  const stopTime = tOverallStart + durationSec * 1000;
  let requestCount = 0;

  async function worker() {
    while (performance.now() < stopTime) {
      const idx = requestCount++;
      const result = await executeSingleRequest(requestOptions, idx);
      latencies.push(result.durationMs);

      const codeStr = String(result.statusCode || 'ERR');
      statusCodes[codeStr] = (statusCodes[codeStr] || 0) + 1;

      if (!result.isSuccess || result.error) {
        errors.push({
          index: idx,
          url: result.url,
          statusCode: result.statusCode,
          error: result.error ? result.error.message : 'Unknown error'
        });
      }

      if (result.customResult !== null && result.customResult !== undefined) {
        customDataList.push(result.customResult);
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  const tOverallEnd = performance.now();
  const totalDurationMs = tOverallEnd - tOverallStart;

  let customMetrics = {};
  if (typeof config.aggregateCustomData === 'function') {
    customMetrics = config.aggregateCustomData(customDataList);
  }

  return calculateStats(latencies, totalDurationMs, statusCodes, errors, customMetrics);
}

/**
 * Formats metrics into a readable terminal output card.
 */
function formatStatsTable(scenarioName, stats) {
  const pad = (str, len) => String(str).padEnd(len);
  const padR = (str, len) => String(str).padStart(len);

  const lines = [
    `┌────────────────────────────────────────────────────────────────────────┐`,
    `│ 📊 SCENARIO: ${pad(scenarioName, 57)}│`,
    `├────────────────────────────────────────────────────────────────────────┤`,
    `│ Total Requests  : ${padR(stats.totalRequests, 8)} │ Success Rate : ${padR((100 - stats.errorRatePct).toFixed(2) + '%', 12)} │ Duration : ${padR(stats.totalDurationMs + 'ms', 8)} │`,
    `│ Throughput      : ${padR(stats.throughputRps + ' req/s', 14)} │ Error Rate   : ${padR(stats.errorRatePct + '%', 12)} │ Errors   : ${padR(stats.failedRequests, 8)} │`,
    `├────────────────────────────────────────────────────────────────────────┤`,
    `│ Latencies (ms)  : Min=${pad(stats.minMs, 6)}  P50=${pad(stats.medianMs, 6)}  P90=${pad(stats.p90Ms, 6)}  P95=${pad(stats.p95Ms, 6)}  P99=${pad(stats.p99Ms, 6)}  Max=${pad(stats.maxMs, 6)} │`,
    `│ Status Codes    : ${pad(JSON.stringify(stats.statusCodes), 52)}│`
  ];

  if (stats.customMetrics && Object.keys(stats.customMetrics).length > 0) {
    lines.push(`├────────────────────────────────────────────────────────────────────────┤`);
    lines.push(`│ Custom Metrics  : ${pad(JSON.stringify(stats.customMetrics), 52)}│`);
  }

  lines.push(`└────────────────────────────────────────────────────────────────────────┘`);
  return lines.join('\n');
}

module.exports = {
  calculateStats,
  executeSingleRequest,
  runConcurrentRequests,
  runBurstRequests,
  runDurationLoad,
  formatStatsTable
};
