// Explicit local development tool: the server independently checks environment and key.
const phone = process.argv[2];
if (!['local', 'staging'].includes(process.env.APP_ENV) || !process.env.LOCAL_DEV_KEY)
  throw new Error('A configured non-production local inbox is required.');
if (!phone || !/^\+998\d{9}$/.test(phone))
  throw new Error('Usage: node --env-file=.env scripts/local-inbox.mjs +998900000001');
const response = await fetch(
  `http://127.0.0.1:${process.env.PORT || 3000}/api/v1/developer/inbox?phone=${encodeURIComponent(phone)}`,
  { headers: { 'x-dev-key': process.env.LOCAL_DEV_KEY } },
);
if (!response.ok) throw new Error(`Local inbox returned HTTP ${response.status}`);
const data = await response.json();
if (!data.items.length) console.log('No active message. Request an OTP from the login page first.');
for (const item of data.items)
  console.log(`${item.createdAt || ''} ${item.code || item.body || ''}`);
