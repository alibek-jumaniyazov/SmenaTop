import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

if (process.env.BOOTSTRAP_CONFIRM !== 'CREATE_INITIAL_PLATFORM_ADMIN')
  throw new Error('Set BOOTSTRAP_CONFIRM=CREATE_INITIAL_PLATFORM_ADMIN explicitly.');
const phone = process.env.BOOTSTRAP_ADMIN_PHONE;
if (!/^\+[1-9]\d{7,14}$/.test(phone ?? '')) throw new Error('BOOTSTRAP_ADMIN_PHONE must be E.164.');
if (!process.env.MFA_ENCRYPTION_KEY || process.env.MFA_ENCRYPTION_KEY.length !== 64)
  throw new Error('Configure MFA_ENCRYPTION_KEY first.');
const db = new PrismaClient();
try {
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(813379428)`;
    if (await tx.platformRoleGrant.count({ where: { revokedAt: null } }))
      throw new Error('Platform grants already exist. Initial bootstrap cannot be reused.');
    const user = await tx.user.upsert({
      where: { phone },
      create: { phone, name: 'Platform operator' },
      update: {},
    });
    await tx.platformRoleGrant.create({
      data: {
        userId: user.id,
        role: 'SUPER_ADMIN',
        permissions: [
          'verification.review',
          'verification.document.read',
          'dispute.resolve',
          'support.manage',
          'billing.reconcile',
          'billing.refund',
          'billing.plan.manage',
          'audit.read',
          'catalog.manage',
          'platform.users.manage',
          'developer.read',
        ],
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: 'platform.initial-bootstrap',
        resourceId: user.id,
        reason: 'Operator-initiated one-time administrative bootstrap',
      },
    });
    await tx.session.updateMany({ where: { userId: user.id }, data: { revokedAt: new Date() } });
  });
  console.log(
    'Initial platform operator provisioned. Complete phone authentication and MFA enrollment before privileged access.',
  );
} finally {
  await db.$disconnect();
}
