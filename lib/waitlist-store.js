import { BlobNotFoundError, BlobPreconditionFailedError, get, put } from '@vercel/blob';
import { normalizeEmail } from './email.js';

export const WAITLIST_PATHNAME = 'waitlist/signups.json';
const ACCESS = 'private';
const MAX_ATTEMPTS = 4;

export const vercelBlob = {
  async get(pathname) {
    try {
      const result = await get(pathname, { access: ACCESS, useCache: false });
      if (!result || result.statusCode !== 200 || !result.stream) return null;
      const text = await new Response(result.stream).text();
      return {
        statusCode: 200,
        etag: result.blob?.etag,
        async text() {
          return text;
        },
      };
    } catch (error) {
      if (error instanceof BlobNotFoundError || error?.name === 'BlobNotFoundError') return null;
      throw error;
    }
  },
  async put(pathname, contents, options = {}) {
    return put(pathname, contents, {
      access: ACCESS,
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
      cacheControlMaxAge: 0,
      ifMatch: options.ifMatch,
    });
  },
};

export function createMemoryBlob() {
  let record = null;
  return {
    async get() {
      if (!record) return null;
      const body = record.body;
      return {
        statusCode: 200,
        etag: record.etag,
        async text() {
          return body;
        },
      };
    },
    async put(_pathname, contents, options = {}) {
      if (record && options.ifMatch && options.ifMatch !== record.etag) {
        const error = new Error('precondition failed');
        error.name = 'BlobPreconditionFailedError';
        throw error;
      }
      const etag = String(Number(record?.etag || 0) + 1);
      record = { body: typeof contents === 'string' ? contents : String(contents), etag };
      return { etag };
    },
  };
}

export async function readSignups(blob = vercelBlob) {
  const current = await readList(blob);
  return current.entries;
}

export async function appendSignup(email, blob = vercelBlob, options = {}) {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return { ok: false, status: 400, error: 'Enter a valid email.' };
  }
  const timestamp = options.now || (() => new Date().toISOString());

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const current = await readList(blob);
    if (current.entries.some((row) => row.email === normalized)) {
      return { ok: true, created: false };
    }
    const next = current.entries.concat([{ email: normalized, at: timestamp() }]);
    try {
      await writeList(blob, next, current.etag);
      return { ok: true, created: true };
    } catch (error) {
      if (!isConflict(error) || attempt === MAX_ATTEMPTS - 1) throw error;
    }
  }

  return { ok: false, status: 500, error: 'Couldn’t save that just now. Try again in a moment.' };
}

export async function removeSignup(email, blob = vercelBlob) {
  const normalized = normalizeEmail(email);
  if (!normalized) return { removed: 0 };

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const current = await readList(blob);
    const next = current.entries.filter((row) => row.email !== normalized);
    const removed = current.entries.length - next.length;
    if (removed === 0) return { removed: 0 };
    try {
      await writeList(blob, next, current.etag);
      return { removed };
    } catch (error) {
      if (!isConflict(error) || attempt === MAX_ATTEMPTS - 1) throw error;
    }
  }

  return { removed: 0 };
}

async function readList(blob) {
  const result = await blob.get(WAITLIST_PATHNAME);
  if (!result) return { entries: [], etag: undefined };
  const text = await result.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const error = new Error('Waitlist store is not valid JSON');
    error.status = 500;
    throw error;
  }
  if (!Array.isArray(parsed)) return { entries: [], etag: result.etag };
  const entries = [];
  for (const row of parsed) {
    if (!row || typeof row.email !== 'string' || typeof row.at !== 'string') continue;
    const email = normalizeEmail(row.email);
    if (!email) continue;
    entries.push({ email, at: row.at });
  }
  return { entries, etag: result.etag };
}

async function writeList(blob, entries, etag) {
  await blob.put(WAITLIST_PATHNAME, JSON.stringify(entries), {
    allowOverwrite: true,
    ifMatch: etag,
  });
}

function isConflict(error) {
  return error instanceof BlobPreconditionFailedError || error?.name === 'BlobPreconditionFailedError';
}
