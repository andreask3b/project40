import { readSignups, removeSignup } from '../lib/waitlist-store.js';
import { normalizeEmail } from '../lib/email.js';

const emailArg = process.argv[2];
const action = process.argv[3] || 'check';

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error(
    'BLOB_READ_WRITE_TOKEN is not set. It lives on Vercel project project40 (team andreask3bs-projects), from the private Blob store project40-waitlist. Do not commit it.',
  );
  process.exit(1);
}

const entries = await readSignups();

if (!emailArg) {
  console.log(JSON.stringify({ count: entries.length }));
  process.exit(0);
}

const email = normalizeEmail(emailArg);
if (!email) {
  console.error('Enter a valid email.');
  process.exit(1);
}

if (action === 'remove') {
  const result = await removeSignup(email);
  const after = await readSignups();
  console.log(JSON.stringify({
    removed: result.removed,
    present: after.some((row) => row.email === email),
    count: after.length,
  }));
  process.exit(0);
}

console.log(JSON.stringify({
  present: entries.some((row) => row.email === email),
  count: entries.length,
}));
