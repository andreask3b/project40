const WINDOW_MS = 60_000;

export function createRateLimiter({ windowMs = WINDOW_MS } = {}) {
  const hits = new Map();

  return {
    allow(key, now = Date.now()) {
      if (!key) return true;
      const previous = hits.get(key);
      if (previous != null && now - previous < windowMs) return false;
      hits.set(key, now);
      return true;
    },
  };
}

export function clientIpFromHeaders(headers) {
  const forwarded = headerValue(headers, 'x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  const realIp = headerValue(headers, 'x-real-ip');
  return realIp ? realIp.trim() : '';
}

function headerValue(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') {
    return headers.get(name) || '';
  }
  const lower = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) {
      const value = headers[key];
      return Array.isArray(value) ? value[0] || '' : String(value || '');
    }
  }
  return '';
}
