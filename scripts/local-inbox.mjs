// Explicit server-side local tool. No browser token, HTTP endpoint or developer key is needed.
import { PrismaClient } from '@prisma/client';

const phone = process.argv[2];
if (
  process.env.APP_ENV !== 'local' ||
  process.env.NODE_ENV === 'production' ||
  process.env.SMS_PROVIDER !== 'local'
)
  throw new Error('The inbox CLI is available only with the local SMS adapter in APP_ENV=local.');
if (!phone || !/^\+998\d{9}$/.test(phone))
  throw new Error('Usage: node --env-file=.env scripts/local-inbox.mjs +998900000001');
const db = new PrismaClient();
try {
  const challenge = await db.otpChallenge.findFirst({
    where: { phone, expiresAt: { gt: new Date() }, consumedAt: null, attempts: { lt: 5 } },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  const item = challenge
    ? await db.localInbox.findFirst({
        where: { phone, challengeId: challenge.id, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
        select: { body: true },
      })
    : null;
  if (item) console.log(item.body);
  else console.log('No active message. Request an OTP from the login page first.');
} finally {
  await db.$disconnect();
}
