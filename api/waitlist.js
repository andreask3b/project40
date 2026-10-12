import { normalizeEmail } from '../lib/email.js';
import { clientIpFromHeaders, createRateLimiter } from '../lib/rate-limit.js';
import { appendSignup, readSignups, vercelBlob } from '../lib/waitlist-store.js';

const limiter = createRateLimiter();
const MAX_BODY = 2000;
const SAVE_ERROR = 'Couldn’t save that just now. Try again in a moment.';

export async function handleWaitlist({
  method,
  rawBody,
  ip,
  blob = vercelBlob,
  rateLimiter = limiter,
  now = Date.now,
} = {}) {
  if (String(method || '').toUpperCase() !== 'POST') {
    return json(405, { ok: false, error: 'Method not allowed.' });
  }

  const parsed = parseBody(rawBody);
  if (!parsed.ok) return json(400, { ok: false, error: 'Enter a valid email.' });

  const email = normalizeEmail(parsed.email);
  if (!email) return json(400, { ok: false, error: 'Enter a valid email.' });

  try {
    const existing = await readSignups(blob);
    if (existing.some((row) => row.email === email)) return json(200, { ok: true });
  } catch (error) {
    console.error('waitlist read failed', error?.name || 'Error');
    return json(500, { ok: false, error: SAVE_ERROR });
  }

  if (!rateLimiter.allow(ip || 'unknown', now())) {
    return json(429, { ok: false, error: 'Please wait a minute and try again.' });
  }

  try {
    const result = await appendSignup(email, blob);
    if (!result.ok) return json(result.status || 400, { ok: false, error: result.error || SAVE_ERROR });
    return json(200, { ok: true });
  } catch (error) {
    console.error('waitlist write failed', error?.name || 'Error');
    return json(500, { ok: false, error: SAVE_ERROR });
  }
}

function parseBody(rawBody) {
  if (rawBody && typeof rawBody === 'object' && !Buffer.isBuffer(rawBody)) {
    return { ok: typeof rawBody.email === 'string', email: rawBody.email };
  }
  const text = typeof rawBody === 'string' ? rawBody : '';
  if (!text || text.length > MAX_BODY) return { ok: false };
  try {
    const data = JSON.parse(text);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false };
    if (typeof data.email !== 'string') return { ok: false };
    return { ok: true, email: data.email };
  } catch {
    return { ok: false };
  }
}

function json(status, body) {
  return { status, body };
}

function readRawBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return Promise.resolve(req.body);
  }
  if (typeof req.body === 'string') return Promise.resolve(req.body);
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  const rawBody = await readRawBody(req);
  const result = await handleWaitlist({
    method: req.method,
    rawBody,
    ip: clientIpFromHeaders(req.headers) || req.socket?.remoteAddress || '',
  });
  res.setHeader('Cache-Control', 'no-store');
  res.status(result.status).json(result.body);
}
