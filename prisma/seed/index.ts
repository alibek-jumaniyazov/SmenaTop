import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';

const db = new PrismaClient();
const id = (key: string) => {
  const h = createHash('sha256').update(`smenatop-demo-v1:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const permissions = [
  'shift.read',
  'shift.create',
  'shift.publish',
  'application.review',
  'attendance.approve',
  'billing.read',
  'billing.manage',
  'wage.read',
  'wage.manage',
  'member.invite',
  'branch.manage',
  'organization.manage',
  'api.manage',
  'analytics.read',
];
const start = new Date();
start.setUTCHours(4, 0, 0, 0);
start.setUTCDate(start.getUTCDate() + 1);

async function main() {
  if (process.env.APP_ENV === 'production' || process.env.NODE_ENV === 'production')
    throw new Error('Synthetic seed is prohibited in production');
  const catalogs = {
    cities: [
      ['tashkent', 'Toshkent', 'Ташкент'],
      ['urgench', 'Urganch', 'Ургенч'],
    ],
    categories: [
      ['waiter', 'Ofitsiant', 'Официант'],
      ['kitchen', 'Oshxona yordamchisi', 'Помощник на кухне'],
      ['cleaning', 'Tozalash mutaxassisi', 'Специалист по уборке'],
      ['warehouse', 'Ombor yordamchisi', 'Помощник на складе'],
    ],
    skills: [
      ['service', 'Mehmonlarga xizmat', 'Обслуживание гостей'],
      ['hygiene', 'Oziq-ovqat gigiyenasi', 'Пищевая гигиена'],
      ['inventory', 'Tovarlarni hisoblash', 'Учёт товаров'],
    ],
  };
  for (const [code, nameUz, nameRu] of catalogs.cities)
    await db.city.upsert({
      where: { code: code! },
      create: { id: id(`city:${code}`), code: code!, nameUz: nameUz!, nameRu: nameRu! },
      update: {},
    });
  for (const [code, nameUz, nameRu] of catalogs.categories)
    await db.jobCategory.upsert({
      where: { code: code! },
      create: { id: id(`category:${code}`), code: code!, nameUz: nameUz!, nameRu: nameRu! },
      update: {},
    });
  for (const [code, nameUz, nameRu] of catalogs.skills)
    await db.skill.upsert({
      where: { code: code! },
      create: { id: id(`skill:${code}`), code: code!, nameUz: nameUz!, nameRu: nameRu! },
      update: {},
    });
  for (const code of permissions)
    await db.permission.upsert({
      where: { code },
      create: { code, description: code },
      update: {},
    });
  const plans = [
    {
      code: 'TRIAL',
      name: '7 kunlik sinov',
      priceMinor: 0n,
      branchLimit: 1,
      memberLimit: 2,
      publishLimit: 5,
    },
    {
      code: 'START',
      name: 'Start',
      priceMinor: 49900000n,
      branchLimit: 1,
      memberLimit: 3,
      publishLimit: 20,
    },
    {
      code: 'PRO',
      name: 'Pro',
      priceMinor: 99900000n,
      branchLimit: 3,
      memberLimit: 10,
      publishLimit: 100,
    },
    {
      code: 'BUSINESS',
      name: 'Business',
      priceMinor: 199900000n,
      branchLimit: 10,
      memberLimit: 30,
      publishLimit: 500,
    },
  ];
  for (const plan of plans) {
    await db.plan.upsert({
      where: { code: plan.code },
      create: {
        id: id(`plan:${plan.code}`),
        code: plan.code,
        name: plan.name,
        active: plan.code !== 'TRIAL',
      },
      update: {},
    });
    await db.planVersion.upsert({
      where: { planId_version: { planId: id(`plan:${plan.code}`), version: 1 } },
      create: {
        id: id(`planversion:${plan.code}`),
        planId: id(`plan:${plan.code}`),
        version: 1,
        priceMinor: plan.priceMinor,
        branchLimit: plan.branchLimit,
        memberLimit: plan.memberLimit,
        publishLimit: plan.publishLimit,
      },
      update: {},
    });
  }
  const account = async (key: string, phone: string, name: string) =>
    db.user.upsert({ where: { phone }, create: { id: id(key), phone, name }, update: {} });
  const owners = [];
  for (let i = 0; i < 3; i++)
    owners.push(
      await account(`owner:${i}`, `+99890000000${i + 1}`, `Namuna ish beruvchi ${i + 1}`),
    );
  const admin = await account('admin', '+998900000099', 'Platforma moderator — namuna');
  const developer = await account('developer', '+998900000098', 'Developer — namuna');
  const platformPermissions = [
    'verification.review',
    'verification.document.read',
    'dispute.resolve',
    'support.manage',
    'audit.read',
    'catalog.manage',
    'billing.read',
    'billing.reconcile',
    'billing.refund',
    'user.manage',
    'billing.plan.manage',
  ];
  await db.platformRoleGrant.upsert({
    where: { userId_role: { userId: admin.id, role: 'PLATFORM_ADMIN' } },
    create: {
      userId: admin.id,
      role: 'PLATFORM_ADMIN',
      permissions: platformPermissions,
    },
    update: { permissions: platformPermissions },
  });
  await db.platformRoleGrant.upsert({
    where: { userId_role: { userId: developer.id, role: 'DEVELOPER' } },
    create: { userId: developer.id, role: 'DEVELOPER', permissions: ['developer.tools'] },
    update: {},
  });
  const orgNames = ['Vaqt Bistro — namuna', 'Sahro Mehmonxona — namuna', 'Qadam Ombor — namuna'];
  for (let i = 0; i < 3; i++) {
    const cityId = id(`city:${i === 2 ? 'urgench' : 'tashkent'}`);
    const organizationId = id(`org:${i}`);
    const owner = owners[i]!;
    await db.organization.upsert({
      where: { id: organizationId },
      create: {
        id: organizationId,
        name: orgNames[i]!,
        contactName: owner.name,
        cityId,
        verificationStatus: 'VERIFIED',
        synthetic: true,
        isDemo: true,
      },
      update: {},
    });
    await db.organizationMembership.upsert({
      where: { organizationId_userId: { organizationId, userId: owner.id } },
      create: { organizationId, userId: owner.id, role: 'OWNER', branchIds: [] },
      update: {},
    });
    await db.branch.upsert({
      where: { id: id(`branch:${i}`) },
      create: {
        id: id(`branch:${i}`),
        organizationId,
        cityId,
        name: i === 0 ? 'Markaz filiali' : i === 1 ? 'Yunusobod filiali' : 'Markaziy ombor',
        address: 'Namuna manzil, 12-uy',
        area: i === 0 ? 'Chilonzor' : i === 1 ? 'Yunusobod' : 'Urganch markazi',
      },
      update: {},
    });
    const periodStart = new Date(Date.now() - 2 * 86400000);
    const periodEnd = new Date(Date.now() + (i === 0 ? 28 : i === 1 ? 5 : -1) * 86400000);
    const code = i === 0 ? 'PRO' : i === 1 ? 'TRIAL' : 'START';
    await db.subscription.upsert({
      where: { organizationId },
      create: {
        id: id(`subscription:${i}`),
        organizationId,
        planVersionId: id(`planversion:${code}`),
        status: i === 0 ? 'ACTIVE' : i === 1 ? 'TRIALING' : 'EXPIRED',
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        anchorDay: periodStart.getUTCDate(),
        renewalSequence: 1,
      },
      update: {},
    });
    await db.entitlement.upsert({
      where: {
        subscriptionId_renewalSequence: {
          subscriptionId: id(`subscription:${i}`),
          renewalSequence: 0,
        },
      },
      create: {
        id: id(`entitlement:${i}`),
        organizationId,
        subscriptionId: id(`subscription:${i}`),
        renewalSequence: 0,
        planVersionId: id(`planversion:${code}`),
        startsAt: periodStart,
        endsAt: periodEnd,
      },
      update: {},
    });
    await db.usageCounter.upsert({
      where: { organizationId_periodKey: { organizationId, periodKey: id(`entitlement:${i}`) } },
      create: {
        organizationId,
        periodKey: id(`entitlement:${i}`),
        entitlementId: id(`entitlement:${i}`),
        publishedCount: i === 1 ? 2 : 5,
      },
      update: {},
    });
  }
  const manager = await account('manager', '+998900000010', 'Filial menejeri — namuna');
  const finance = await account('finance', '+998900000011', 'Moliya mutaxassisi — namuna');
  for (const [user, role] of [
    [manager, 'MANAGER'],
    [finance, 'FINANCE'],
  ] as const)
    await db.organizationMembership.upsert({
      where: { organizationId_userId: { organizationId: id('org:0'), userId: user.id } },
      create: {
        organizationId: id('org:0'),
        userId: user.id,
        role,
        branchIds: role === 'MANAGER' ? [id('branch:0')] : [],
      },
      update: {},
    });
  const workers = [];
  for (let i = 0; i < 18; i++) {
    const worker = await account(
      `worker:${i}`,
      `+998901000${String(i + 1).padStart(3, '0')}`,
      `Namuna ishchi ${String(i + 1).padStart(2, '0')}`,
    );
    workers.push(worker);
    await db.workerProfile.upsert({
      where: { userId: worker.id },
      create: {
        id: id(`profile:${i}`),
        userId: worker.id,
        cityId: id(`city:${i > 13 ? 'urgench' : 'tashkent'}`),
        categoryIds: catalogs.categories.map((c) => id(`category:${c[0]}`)),
        languages: ['uz', 'ru'],
        experience: `${(i % 4) + 1} yillik namuna ish tajribasi. Sintetik profil.`,
        adultConfirmed: true,
        verificationStatus: i === 17 ? 'PENDING' : 'VERIFIED',
      },
      update: {},
    });
    for (const skill of catalogs.skills)
      await db.workerSkill.upsert({
        where: {
          workerProfileId_skillId: {
            workerProfileId: id(`profile:${i}`),
            skillId: id(`skill:${skill[0]}`),
          },
        },
        create: {
          workerProfileId: id(`profile:${i}`),
          skillId: id(`skill:${skill[0]}`),
          status: i === 17 ? 'PENDING' : 'VERIFIED',
          verifiedById: i === 17 ? null : admin.id,
          verifiedAt: i === 17 ? null : new Date(),
        },
        update: {},
      });
    await db.availability.upsert({
      where: { id: id(`availability:${i}`) },
      create: {
        id: id(`availability:${i}`),
        workerProfileId: id(`profile:${i}`),
        startAt: start,
        endAt: new Date(start.getTime() + 14 * 86400000),
      },
      update: {},
    });
    await db.consentRecord.upsert({
      where: {
        userId_type_version: {
          userId: worker.id,
          type: 'TERMS_AND_18_PLUS',
          version: '2026-09-draft',
        },
      },
      create: { userId: worker.id, type: 'TERMS_AND_18_PLUS', version: '2026-09-draft' },
      update: {},
    });
  }
  await db.verificationRequest.upsert({
    where: { id: id('verification:worker') },
    create: {
      id: id('verification:worker'),
      subjectType: 'WORKER',
      subjectId: id('profile:17'),
      submittedById: workers[17]!.id,
      status: 'PENDING',
      notes: 'Sintetik profilni ko‘rib chiqish uchun namuna.',
    },
    update: {},
  });
  const titles = [
    'Kechki xizmat uchun ofitsiant',
    'Oshxona jamoasiga yordamchi',
    'Xonalarni tayyorlash smenasi',
    'Tovarlarni tartiblash smenasi',
  ];
  for (let i = 0; i < 30; i++) {
    const org = i % 3;
    const cat = i % 4;
    const past = i >= 26;
    const date = new Date(
      start.getTime() +
        (past ? -(i - 24) * 86400000 : Math.floor(i / 3) * 86400000) +
        (i % 3) * 3600000,
    );
    const end = new Date(date.getTime() + 8 * 3600000);
    await db.shift.upsert({
      where: { id: id(`shift:${i}`) },
      create: {
        id: id(`shift:${i}`),
        organizationId: id(`org:${org}`),
        branchId: id(`branch:${org}`),
        cityId: id(`city:${org === 2 ? 'urgench' : 'tashkent'}`),
        categoryId: id(`category:${catalogs.categories[cat]![0]}`),
        title: titles[cat]!,
        description:
          'Aniq vazifalar, kelishilgan vaqt va shaffof ish haqi. Bu smena mahalliy sinov uchun yaratilgan namuna ma’lumotidir.',
        duties: ['Jamoa bilan kelishilgan vazifalarni bajarish', 'Ish joyini tartibli saqlash'],
        requirements: ['18 yoshdan katta', 'Tasdiqlangan profil'],
        requiredSkillIds: [],
        startAt: date,
        endAt: end,
        breakMinutes: 30,
        paidBreak: false,
        headcount: (i % 3) + 1,
        amountMinor: cat === 2 ? 18000000n : 2500000n + BigInt(i % 5) * 500000n,
        payType: cat === 2 ? 'FIXED' : 'HOURLY',
        applyDeadline: date,
        status: past ? 'COMPLETED' : i === 25 ? 'DRAFT' : 'PUBLISHED',
        publishedAt: new Date(),
        mealProvided: i % 2 === 0,
        transportProvided: i % 5 === 0,
        clothing: 'Qulay, toza kiyim',
      },
      update: {},
    });
    if (i < 4 || past) {
      const wi = past ? i - 16 : i + 1;
      const worker = workers[wi]!;
      const applicationId = id(`application:${i}`);
      const offerId = id(`offer:${i}`);
      await db.shiftApplication.upsert({
        where: { id: applicationId },
        create: {
          id: applicationId,
          organizationId: id(`org:${org}`),
          shiftId: id(`shift:${i}`),
          workerId: worker.id,
          status: 'ACCEPTED',
          note: 'Namuna ariza',
        },
        update: {},
      });
      await db.shiftOffer.upsert({
        where: { id: offerId },
        create: {
          id: offerId,
          organizationId: id(`org:${org}`),
          applicationId,
          shiftId: id(`shift:${i}`),
          workerId: worker.id,
          status: 'ACCEPTED',
          expiresAt: date,
          createdById: owners[org]!.id,
        },
        update: {},
      });
      const assignmentId = id(`assignment:${i}`);
      await db.assignment.upsert({
        where: { id: assignmentId },
        create: {
          id: assignmentId,
          organizationId: id(`org:${org}`),
          shiftId: id(`shift:${i}`),
          workerId: worker.id,
          offerId,
          status: past ? 'COMPLETED' : 'CONFIRMED',
          startAt: date,
          endAt: end,
          policySnapshot: { source: 'synthetic-seed', amountMinor: '2500000', payType: 'HOURLY' },
        },
        update: {},
      });
      if (!past)
        await db.activeBooking.upsert({
          where: { assignmentId },
          create: {
            assignmentId,
            organizationId: id(`org:${org}`),
            shiftId: id(`shift:${i}`),
            workerId: worker.id,
            startAt: date,
            endAt: end,
          },
          update: {},
        });
      if (past) {
        const timesheetId = id(`timesheet:${i}`);
        await db.timesheet.upsert({
          where: { assignmentId },
          create: {
            id: timesheetId,
            organizationId: id(`org:${org}`),
            assignmentId,
            startedAt: date,
            endedAt: end,
            breakMinutes: 30,
            paidMinutes: 450,
            status: 'APPROVED',
            workerApprovedAt: end,
            managerApprovedAt: end,
            rateMinor: 2500000n,
          },
          update: {},
        });
        await db.wageRecord.upsert({
          where: { assignmentId },
          create: {
            organizationId: id(`org:${org}`),
            assignmentId,
            timesheetId,
            amountMinor: 18750000n,
            status:
              i === 26
                ? 'APPROVED'
                : i === 27
                  ? 'EMPLOYER_MARKED_PAID'
                  : i === 28
                    ? 'WORKER_CONFIRMED'
                    : 'DISPUTED',
            snapshot: { source: 'synthetic', rateMinor: '2500000', paidMinutes: 450 },
            employerMarkedPaidAt: i >= 27 ? end : null,
            workerConfirmedAt: i === 28 ? end : null,
          },
          update: {},
        });
      }
      await db.conversation.upsert({
        where: { assignmentId },
        create: {
          id: id(`conversation:${i}`),
          organizationId: id(`org:${org}`),
          assignmentId,
          participants: { create: [{ userId: worker.id }, { userId: owners[org]!.id }] },
        },
        update: {},
      });
    }
  }
  // A pending offer for the primary worker account makes the consent flow immediately reviewable.
  const demoShift = await db.shift.findUniqueOrThrow({ where: { id: id('shift:4') } });
  await db.shiftApplication.upsert({
    where: { shiftId_workerId: { shiftId: demoShift.id, workerId: workers[0]!.id } },
    create: {
      id: id('application:primary'),
      organizationId: demoShift.organizationId,
      shiftId: demoShift.id,
      workerId: workers[0]!.id,
      status: 'OFFERED',
    },
    update: {},
  });
  await db.shiftOffer.upsert({
    where: { id: id('offer:primary') },
    create: {
      id: id('offer:primary'),
      organizationId: demoShift.organizationId,
      applicationId: id('application:primary'),
      shiftId: demoShift.id,
      workerId: workers[0]!.id,
      expiresAt: demoShift.startAt,
      createdById: owners[1]!.id,
    },
    update: {},
  });
  await db.dispute.upsert({
    where: { id: id('dispute:demo') },
    create: {
      id: id('dispute:demo'),
      organizationId: id('org:2'),
      assignmentId: id('assignment:29'),
      createdById: workers[13]!.id,
      category: 'PAYMENT',
      description: 'Namuna: to‘langan summa bo‘yicha kelishmovchilik.',
    },
    update: {},
  });
  await db.notification.upsert({
    where: { dedupeKey: 'seed-welcome-primary' },
    create: {
      userId: workers[0]!.id,
      type: 'WELCOME',
      title: 'SmenaTop namunasiga xush kelibsiz',
      body: 'Bu sintetik demo. Arizalar bo‘limida taklifni tekshiring.',
      dedupeKey: 'seed-welcome-primary',
    },
    update: {},
  });
  for (let i = 0; i < 3; i++) {
    const organizationId = id(`org:${i}`);
    const invoiceId = id(`invoice:${i}`);
    await db.invoice.upsert({
      where: { id: invoiceId },
      create: {
        id: invoiceId,
        organizationId,
        subscriptionId: id(`subscription:${i}`),
        planVersionId: id('planversion:START'),
        renewalSequence: 10 + i,
        amountMinor: 49900000n,
        status: i === 0 ? 'PAID' : 'PENDING',
        snapshot: {
          source: 'synthetic',
          planName: 'Start',
          priceMinor: '49900000',
          notFiscalReceipt: true,
        },
      },
      update: {},
    });
    const attemptId = id(`attempt:${i}`);
    await db.paymentAttempt.upsert({
      where: { id: attemptId },
      create: {
        id: attemptId,
        organizationId,
        invoiceId,
        provider: 'MOCK',
        environment: 'LOCAL',
        status: i === 0 ? 'SUCCESS' : i === 1 ? 'PENDING' : 'FAILED',
      },
      update: {},
    });
    await db.providerTransaction.upsert({
      where: {
        provider_environment_providerTransactionId: {
          provider: 'MOCK',
          environment: 'LOCAL',
          providerTransactionId: `seed-${i}`,
        },
      },
      create: {
        organizationId,
        invoiceId,
        paymentAttemptId: attemptId,
        provider: 'MOCK',
        environment: 'LOCAL',
        providerTransactionId: `seed-${i}`,
        status: i === 0 ? 'SUCCESS' : i === 1 ? 'PENDING' : 'FAILED',
        rawStatus: i === 0 ? 'SUCCESS' : i === 1 ? 'PENDING' : 'FAILED',
        amountMinor: 49900000n,
        currency: 'UZS',
        paidAt: i === 0 ? new Date() : null,
      },
      update: {},
    });
  }
  process.stdout.write(
    'Synthetic seed ready: 3 organizations, 18 workers, 30 shifts. Employer +998900000001; worker +998901000001; moderator +998900000099; developer +998900000098. Use protected local OTP inbox.\n',
  );
}
main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Seed failed'}\n`);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
