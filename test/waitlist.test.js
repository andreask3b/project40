import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { handleWaitlist } from '../api/waitlist.js';
import { normalizeEmail } from '../lib/email.js';
import { createRateLimiter } from '../lib/rate-limit.js';
import { appendSignup, createMemoryBlob, readSignups, removeSignup } from '../lib/waitlist-store.js';

test('normalizeEmail accepts a basic address and rejects malformed ones', () => {
  assert.equal(normalizeEmail('  Fake-Waitlist-Test+2099@Example.com '), 'fake-waitlist-test+2099@example.com');
  assert.equal(normalizeEmail('a@b.co'), 'a@b.co');
  assert.equal(normalizeEmail('not-an-email'), null);
  assert.equal(normalizeEmail('a@b'), null);
  assert.equal(normalizeEmail('a @b.co'), null);
  assert.equal(normalizeEmail(''), null);
  assert.equal(normalizeEmail('a@b..co'), null);
  assert.equal(normalizeEmail(42), null);
});

test('appendSignup stores email and timestamp, then dedupes case-insensitively', async () => {
  const blob = createMemoryBlob();
  let ticks = 0;
  const now = () => `2026-06-15T12:00:0${ticks++}Z`;

  const created = await appendSignup('Person@Example.com', blob, { now });
  assert.deepEqual(created, { ok: true, created: true });

  const again = await appendSignup('person@example.com', blob, { now });
  assert.deepEqual(again, { ok: true, created: false });

  const entries = await readSignups(blob);
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0], {
    email: 'person@example.com',
    at: '2026-06-15T12:00:00Z',
  });
});

test('appendSignup rejects an invalid email without writing', async () => {
  const blob = createMemoryBlob();
  const result = await appendSignup('nope', blob);
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.deepEqual(await readSignups(blob), []);
});

test('removeSignup drops one address and leaves the rest', async () => {
  const blob = createMemoryBlob();
  await appendSignup('keep@example.com', blob, { now: () => '2026-01-01T00:00:00.000Z' });
  await appendSignup('drop@example.com', blob, { now: () => '2026-01-02T00:00:00.000Z' });
  const removed = await removeSignup('DROP@example.com', blob);
  assert.equal(removed.removed, 1);
  const entries = await readSignups(blob);
  assert.deepEqual(entries.map((row) => row.email), ['keep@example.com']);
});

test('POST /api/waitlist returns ok and does not echo stored emails', async () => {
  const blob = createMemoryBlob();
  const result = await handleWaitlist({
    method: 'POST',
    rawBody: JSON.stringify({ email: 'Fake-Waitlist-Test+2099@Example.com', name: 'nope' }),
    ip: '203.0.113.10',
    blob,
    rateLimiter: createRateLimiter(),
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true });
  assert.equal(JSON.stringify(result.body).includes('@'), false);

  const entries = await readSignups(blob);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].email, 'fake-waitlist-test+2099@example.com');
  assert.equal(typeof entries[0].at, 'string');
  assert.equal(Number.isNaN(Date.parse(entries[0].at)), false);
  assert.equal('name' in entries[0], false);
});

test('POST duplicate is success and does not append again', async () => {
  const blob = createMemoryBlob();
  const first = await handleWaitlist({
    method: 'POST',
    rawBody: '{"email":"dup@example.com"}',
    ip: '203.0.113.11',
    blob,
    rateLimiter: createRateLimiter(),
  });
  const second = await handleWaitlist({
    method: 'POST',
    rawBody: '{"email":"DUP@example.com"}',
    ip: '203.0.113.11',
    blob,
    rateLimiter: createRateLimiter(),
  });
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal((await readSignups(blob)).length, 1);
});

test('invalid POST leaves the store empty', async () => {
  const blob = createMemoryBlob();
  const result = await handleWaitlist({
    method: 'POST',
    rawBody: '{"email":"broken"}',
    ip: '203.0.113.12',
    blob,
    rateLimiter: createRateLimiter(),
  });
  assert.equal(result.status, 400);
  assert.equal(result.body.ok, false);
  assert.deepEqual(await readSignups(blob), []);
});

test('a second new signup from the same IP inside a minute is rejected', async () => {
  const blob = createMemoryBlob();
  const limiter = createRateLimiter();
  const now = () => 1_000_000;
  const first = await handleWaitlist({
    method: 'POST',
    rawBody: '{"email":"one@example.com"}',
    ip: '198.51.100.8',
    blob,
    rateLimiter: limiter,
    now,
  });
  const second = await handleWaitlist({
    method: 'POST',
    rawBody: '{"email":"two@example.com"}',
    ip: '198.51.100.8',
    blob,
    rateLimiter: limiter,
    now,
  });
  assert.equal(first.status, 200);
  assert.equal(second.status, 429);
  assert.deepEqual((await readSignups(blob)).map((row) => row.email), ['one@example.com']);
});

test('GET does not return the stored list', async () => {
  const blob = createMemoryBlob();
  await appendSignup('secret@example.com', blob);
  const result = await handleWaitlist({
    method: 'GET',
    rawBody: '',
    ip: '203.0.113.13',
    blob,
    rateLimiter: createRateLimiter(),
  });
  assert.equal(result.status, 405);
  assert.equal(JSON.stringify(result.body).includes('secret@example.com'), false);
});

test('blob failures become a short error and do not claim success', async () => {
  const blob = {
    async get() {
      throw new Error('store unavailable');
    },
    async put() {
      throw new Error('store unavailable');
    },
  };
  const result = await handleWaitlist({
    method: 'POST',
    rawBody: '{"email":"ok@example.com"}',
    ip: '203.0.113.14',
    blob,
    rateLimiter: createRateLimiter(),
  });
  assert.equal(result.status, 500);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.error.includes('@'), false);
});

test('public pages do not claim nothing is stored and keep example-only copy', () => {
  const home = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const waitlist = readFileSync(new URL('../waitlist/index.html', import.meta.url), 'utf8');
  const week = readFileSync(new URL('../week/index.html', import.meta.url), 'utf8');
  const combined = `${home}\n${waitlist}\n${week}`;

  assert.equal(combined.includes('Nothing stored'), false);
  assert.equal(home.includes('15.06.2028'), true);
  assert.equal(home.includes('href="/waitlist"'), true);
  assert.equal(waitlist.includes('15.06.2028'), false);
  assert.equal(waitlist.includes('/api/waitlist'), true);
  assert.equal(waitlist.includes('name="note"'), false);
  assert.equal(waitlist.includes('goal date'), false);

  for (const phrase of ['Graz', 'Strava', '26.03.2029']) {
    assert.equal(combined.includes(phrase), false, phrase);
  }
});
