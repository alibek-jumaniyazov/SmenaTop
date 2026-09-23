import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionsService } from '../common/permissions.service';
import type { AuthUser } from '../auth/current-user';
import type { BankConfirmDto, BankEvidenceDto, CheckoutDto, PlanVersionDto } from './billing.dto';
import { constantTimeEquals, nextPaidPeriod, payloadHash, preserveSuccess } from './billing.rules';
import { paymeCheckout, paymeConfiguration } from './payment-provider';

export interface VerifiedPaymentEvent {
  provider: string;
  environment: string;
  providerTransactionId: string;
  attemptId: string;
  eventKey: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
  amountMinor: string;
  currency: string;
  verifiedById?: string;
  verificationReason?: string;
  evidenceFileId?: string;
}

@Injectable()
export class BillingService {
  constructor(
    private readonly db: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  plans() {
    return this.db.plan.findMany({
      where: { active: true },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
      orderBy: { code: 'asc' },
    });
  }

  async createPlanVersion(user: AuthUser, planId: string, input: PlanVersionDto) {
    this.permissions.requirePlatform(user, 'billing.plan.manage');
    if (BigInt(input.priceMinor) <= 0n)
      throw new BadRequestException('Tarif narxi musbat bo‘lishi kerak');
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Plan" WHERE id = ${planId}::uuid FOR UPDATE`;
      const plan = await tx.plan.findUniqueOrThrow({ where: { id: planId } });
      const latest = await tx.planVersion.findFirst({
        where: { planId },
        orderBy: { version: 'desc' },
      });
      const version = await tx.planVersion.create({
        data: {
          planId: plan.id,
          version: (latest?.version ?? 0) + 1,
          priceMinor: BigInt(input.priceMinor),
          currency: 'UZS',
          branchLimit: input.branchLimit,
          memberLimit: input.memberLimit,
          publishLimit: input.publishLimit,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: 'billing.plan-version.create',
          resourceId: version.id,
          reason: input.reason,
          metadata: { planId, version: version.version, priceMinor: input.priceMinor },
        },
      });
      return version;
    });
  }

  providers() {
    const local =
      process.env.APP_ENV !== 'production' &&
      process.env.NODE_ENV !== 'production' &&
      process.env.LOCAL_MOCK_PAYMENTS === 'true';
    const payme = paymeConfiguration();
    const bank = Boolean(process.env.BANK_ACCOUNT_REFERENCE && process.env.BANK_BENEFICIARY);
    return [
      {
        id: 'MOCK',
        status: local ? 'LOCAL_MOCK' : 'NOT_CONFIGURED',
        reason: local
          ? 'Sintetik tashkilotlar uchun lokal simulyator. Real pul olinmaydi.'
          : 'Lokal to‘lov simulyatori yopiq.',
        capabilities: { checkout: local, refund: local, recurring: false },
      },
      {
        id: 'PAYME',
        status: payme.configured ? 'UNVERIFIED' : 'NOT_CONFIGURED',
        reason: payme.configured
          ? 'Merchant API adapter sozlangan; provider sandbox tasdig‘i alohida talab qilinadi.'
          : 'Merchant credential va sandbox tekshiruvi talab qilinadi.',
        capabilities: { checkout: payme.configured, refund: false, recurring: false },
      },
      {
        id: 'CLICK',
        status: 'NOT_CONFIGURED',
        reason: 'Shop API hujjati va merchant sandbox tekshiruvi talab qilinadi.',
        capabilities: { checkout: false, refund: false, recurring: false },
      },
      {
        id: 'BANK',
        status: bank ? 'MANUAL_VERIFICATION' : 'NOT_CONFIGURED',
        reason: bank
          ? 'Dalil yuborish to‘lov tasdig‘i emas. Platforma moliya xodimi bank tushumini mustaqil tekshiradi.'
          : 'Operator bank rekvizitlari va mustaqil tushum tekshiruvi sozlanmagan.',
        capabilities: { checkout: bank, refund: false, recurring: false },
      },
    ];
  }

  async overview(user: AuthUser, organizationId: string) {
    await this.permissions.requireOrg(user.id, organizationId, 'billing.read');
    const [subscription, entitlements, invoices, reconciliation] = await Promise.all([
      this.db.subscription.findUnique({ where: { organizationId } }),
      this.db.entitlement.findMany({
        where: { organizationId },
        orderBy: { startsAt: 'desc' },
        take: 24,
        include: { planVersion: true },
      }),
      this.db.invoice.findMany({
        where: { organizationId },
        include: { attempts: true },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.db.reconciliationCase.findMany({ where: { organizationId, status: 'OPEN' }, take: 50 }),
    ]);
    const now = new Date();
    const effectiveEntitlement =
      entitlements.find((e) => !e.revokedAt && e.startsAt <= now && e.endsAt > now) ?? null;
    return {
      subscription: subscription
        ? {
            ...subscription,
            effectiveStatus: !effectiveEntitlement ? 'EXPIRED' : subscription.status,
          }
        : null,
      entitlements,
      effectiveEntitlement,
      invoices,
      reconciliation,
      providers: this.providers(),
      policy: {
        trialPayment:
          'Birinchi to‘lov paid davrni darhol boshlaydi. Trialning qolgan kunlari qo‘shilmaydi.',
        planChange: 'Tarif o‘zgarishi keyingi davr boshidan amal qiladi.',
        fiscal: 'Ichki invoice rasmiy fiskal chek emas.',
      },
    };
  }

  async checkout(user: AuthUser, organizationId: string, input: CheckoutDto) {
    await this.permissions.requireOrg(user.id, organizationId, 'billing.manage');
    const provider = this.providers().find((p) => p.id === input.provider);
    if (!provider?.capabilities.checkout)
      throw new ServiceUnavailableException({
        code: 'NOT_CONFIGURED',
        message: provider?.reason ?? 'Provider sozlanmagan',
      });
    if (input.provider === 'MOCK') await this.assertSynthetic(organizationId);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Subscription" WHERE "organizationId" = ${organizationId}::uuid FOR UPDATE`;
      const subscription = await tx.subscription.findUniqueOrThrow({ where: { organizationId } });
      const plan = await tx.planVersion.findUnique({
        where: { id: input.planVersionId },
        include: { plan: true },
      });
      if (!plan?.plan.active) throw new BadRequestException('Faol tarif topilmadi');
      const latest = await tx.planVersion.findFirst({
        where: { planId: plan.planId },
        orderBy: { version: 'desc' },
      });
      if (latest?.id !== plan.id)
        throw new ConflictException('Tarif narxi yangilandi; tariflarni qayta yuklang');
      let invoice = await tx.invoice.findFirst({
        where: {
          subscriptionId: subscription.id,
          renewalSequence: subscription.renewalSequence,
          status: 'PENDING',
        },
        orderBy: { createdAt: 'desc' },
      });
      if (invoice && invoice.planVersionId !== plan.id) {
        await tx.invoice.update({ where: { id: invoice.id }, data: { status: 'SUPERSEDED' } });
        invoice = null;
      }
      if (!invoice) {
        const planned = nextPaidPeriod(subscription, new Date());
        invoice = await tx.invoice.create({
          data: {
            organizationId,
            subscriptionId: subscription.id,
            planVersionId: plan.id,
            renewalSequence: subscription.renewalSequence,
            amountMinor: plan.priceMinor,
            currency: plan.currency,
            status: 'PENDING',
            plannedStart: planned.start,
            plannedEnd: planned.end,
            snapshot: {
              planCode: plan.plan.code,
              planName: plan.plan.name,
              version: plan.version,
              priceMinor: plan.priceMinor.toString(),
              currency: plan.currency,
              branchLimit: plan.branchLimit,
              memberLimit: plan.memberLimit,
              publishLimit: plan.publishLimit,
              tax: 'UNCONFIGURED',
              fiscalReceipt: false,
            },
          },
        });
      }
      let attempt = await tx.paymentAttempt.create({
        data: {
          organizationId,
          invoiceId: invoice.id,
          provider: input.provider,
          environment:
            input.provider === 'PAYME'
              ? paymeConfiguration().environment!
              : input.provider === 'BANK'
                ? process.env.APP_ENV === 'production'
                  ? 'LIVE'
                  : 'LOCAL'
                : 'LOCAL',
          status: 'PENDING',
        },
      });
      if (input.provider === 'PAYME')
        attempt = await tx.paymentAttempt.update({
          where: { id: attempt.id },
          data: { checkoutUrl: paymeCheckout(attempt.id, invoice.amountMinor) },
        });
      await this.audit(tx, user.id, organizationId, 'billing.checkout', invoice.id, {
        attemptId: attempt.id,
        provider: input.provider,
        renewalSequence: invoice.renewalSequence,
      });
      return {
        invoice,
        attempt,
        checkoutUrl: attempt.checkoutUrl,
        ...(input.provider === 'BANK'
          ? {
              bankInstructions: {
                beneficiary: process.env.BANK_BENEFICIARY,
                accountReference: process.env.BANK_ACCOUNT_REFERENCE,
                paymentReference: invoice.id,
                amountMinor: invoice.amountMinor.toString(),
                currency: invoice.currency,
              },
            }
          : {}),
      };
    });
  }

  async cancelSubscription(user: AuthUser, organizationId: string, cancelAtPeriodEnd: boolean) {
    await this.permissions.requireOrg(user.id, organizationId, 'billing.manage');
    return this.db.$transaction(async (tx) => {
      const subscription = await tx.subscription.update({
        where: { organizationId },
        data: { cancelAtPeriodEnd, version: { increment: 1 } },
      });
      await this.audit(
        tx,
        user.id,
        organizationId,
        'subscription.cancel-at-period-end',
        subscription.id,
        { cancelAtPeriodEnd },
      );
      return subscription;
    });
  }

  private async assertSynthetic(organizationId: string) {
    if (
      process.env.APP_ENV === 'production' ||
      process.env.NODE_ENV === 'production' ||
      process.env.LOCAL_MOCK_PAYMENTS !== 'true'
    )
      throw new ForbiddenException('Simulator faqat local/staging muhitida');
    const org = await this.db.organization.findUniqueOrThrow({ where: { id: organizationId } });
    if (!org.isDemo || !org.synthetic)
      throw new ForbiddenException('Simulator faqat sintetik tashkilotlar uchun');
  }

  async simulate(user: AuthUser, attemptId: string, scenario: string) {
    const attempt = await this.db.paymentAttempt.findUnique({
      where: { id: attemptId },
      include: { invoice: true },
    });
    if (!attempt) throw new NotFoundException('Payment attempt topilmadi');
    await this.assertSynthetic(attempt.organizationId);
    if (!user.platformPermissions.includes('developer.tools'))
      await this.permissions.requireOrg(user.id, attempt.organizationId, 'billing.manage');
    if (attempt.provider !== 'MOCK' || attempt.environment !== 'LOCAL')
      throw new ForbiddenException('Faqat lokal mock attempt');
    const secret = process.env.MOCK_PAYMENT_SECRET;
    if (!secret || secret.length < 32)
      throw new ServiceUnavailableException('MOCK_PAYMENT_SECRET sozlanmagan');
    const status =
      scenario === 'pending'
        ? 'PENDING'
        : scenario === 'failure'
          ? 'FAILED'
          : scenario === 'cancel'
            ? 'CANCELLED'
            : 'SUCCESS';
    const event: VerifiedPaymentEvent = {
      provider: 'MOCK',
      environment: 'LOCAL',
      providerTransactionId: `mock-${attempt.id}`,
      attemptId,
      eventKey: `${attempt.id}:${status}`,
      status,
      amountMinor: (
        attempt.invoice.amountMinor + (scenario === 'wrong_amount' ? 1n : 0n)
      ).toString(),
      currency: 'UZS',
    };
    if (scenario === 'late') {
      // A genuine out-of-order sequence: a failure precedes an authenticated eventual success.
      await this.mockCallback(secret, {
        ...event,
        status: 'FAILED',
        eventKey: `${attempt.id}:FAILED`,
      });
    }
    const result = await this.mockCallback(scenario === 'invalid_auth' ? 'invalid' : secret, event);
    if (scenario === 'duplicate') await this.mockCallback(secret, event);
    return result;
  }

  async mockCallback(authorization: string, event: VerifiedPaymentEvent) {
    if (
      process.env.APP_ENV === 'production' ||
      process.env.NODE_ENV === 'production' ||
      process.env.LOCAL_MOCK_PAYMENTS !== 'true'
    )
      throw new ForbiddenException();
    const secret = process.env.MOCK_PAYMENT_SECRET;
    if (!secret || secret.length < 32 || !constantTimeEquals(authorization, secret))
      throw new ForbiddenException('Provider autentifikatsiyasi xato');
    if (event.provider !== 'MOCK' || event.environment !== 'LOCAL')
      throw new ForbiddenException('Provider muhiti noto‘g‘ri');
    const attempt = await this.db.paymentAttempt.findUniqueOrThrow({
      where: { id: event.attemptId },
    });
    await this.assertSynthetic(attempt.organizationId);
    return this.receiveVerifiedEvent(event);
  }

  /** Only verified adapter methods may call this boundary. No public browser route can mark an invoice paid. */
  async receiveVerifiedEvent(event: VerifiedPaymentEvent) {
    const attempt = await this.db.paymentAttempt.findUnique({
      where: { id: event.attemptId },
      include: { invoice: true },
    });
    if (!attempt) throw new NotFoundException('Attempt topilmadi');
    if (
      attempt.provider !== event.provider ||
      attempt.environment !== event.environment ||
      attempt.invoice.currency !== event.currency
    )
      throw new BadRequestException('Provider/account/environment/currency mos emas');
    if (
      !/^\d{1,18}$/.test(event.amountMinor) ||
      BigInt(event.amountMinor) !== attempt.invoice.amountMinor
    )
      throw new BadRequestException('To‘lov summasi invoice bilan mos emas');
    const hash = payloadHash(event);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Subscription" WHERE id = ${attempt.invoice.subscriptionId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id = ${attempt.invoiceId}::uuid FOR UPDATE`;
      const priorEvent = await tx.paymentEvent.findUnique({
        where: {
          provider_environment_eventKey: {
            provider: event.provider,
            environment: event.environment,
            eventKey: event.eventKey,
          },
        },
      });
      if (priorEvent) {
        if (priorEvent.payloadHash !== hash)
          throw new ConflictException('Idempotency kaliti boshqa payload bilan ishlatilgan');
        return {
          duplicate: true,
          invoice: await tx.invoice.findUniqueOrThrow({ where: { id: attempt.invoiceId } }),
        };
      }
      let transaction = await tx.providerTransaction.findUnique({
        where: {
          provider_environment_providerTransactionId: {
            provider: event.provider,
            environment: event.environment,
            providerTransactionId: event.providerTransactionId,
          },
        },
      });
      if (
        transaction &&
        (transaction.invoiceId !== attempt.invoiceId ||
          transaction.paymentAttemptId !== attempt.id ||
          transaction.amountMinor !== BigInt(event.amountMinor))
      )
        throw new ConflictException('Provider transaction boshqa hisobga bog‘langan');
      if (
        event.provider === 'PAYME' &&
        event.status === 'SUCCESS' &&
        (!transaction ||
          !['PENDING', 'SUCCESS'].includes(transaction.status) ||
          (transaction.status === 'PENDING' &&
            (!transaction.providerCreatedAt ||
              Date.now() - transaction.providerCreatedAt.getTime() >= 43_200_000)))
      )
        throw new ConflictException('Payme transaction holati yoki muddati mos emas');
      const status = preserveSuccess(transaction?.status ?? 'PENDING', event.status);
      const rawStatus =
        event.provider === 'PAYME' ? (event.status === 'SUCCESS' ? '2' : '1') : event.status;
      const paidAt = new Date();
      transaction = transaction
        ? await tx.providerTransaction.update({
            where: { id: transaction.id },
            data: {
              status,
              rawStatus,
              ...(status === 'SUCCESS' && !transaction.paidAt ? { paidAt } : {}),
            },
          })
        : await tx.providerTransaction.create({
            data: {
              organizationId: attempt.organizationId,
              invoiceId: attempt.invoiceId,
              paymentAttemptId: attempt.id,
              provider: event.provider,
              environment: event.environment,
              providerTransactionId: event.providerTransactionId,
              status,
              rawStatus,
              amountMinor: BigInt(event.amountMinor),
              currency: event.currency,
              paidAt: status === 'SUCCESS' ? paidAt : null,
            },
          });
      await tx.paymentEvent.create({
        data: {
          transactionId: transaction.id,
          provider: event.provider,
          environment: event.environment,
          eventKey: event.eventKey,
          payloadHash: hash,
          kind: event.status,
        },
      });
      await tx.paymentAttempt.update({ where: { id: attempt.id }, data: { status } });
      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: attempt.invoiceId } });
      if (status !== 'SUCCESS') return { duplicate: false, invoice, transaction };
      const entitlement = await tx.entitlement.findUnique({
        where: {
          subscriptionId_renewalSequence: {
            subscriptionId: invoice.subscriptionId,
            renewalSequence: invoice.renewalSequence,
          },
        },
      });
      if (invoice.fulfilledTransactionId === transaction.id)
        return { duplicate: false, invoice, transaction };
      if (entitlement || ['SUPERSEDED', 'REFUNDED', 'CANCELLED'].includes(invoice.status)) {
        if (
          entitlement?.invoiceId !== invoice.id ||
          invoice.fulfilledAt ||
          invoice.status !== 'PAID'
        ) {
          await tx.reconciliationCase.create({
            data: {
              organizationId: invoice.organizationId,
              invoiceId: invoice.id,
              transactionId: transaction.id,
              kind:
                invoice.status === 'SUPERSEDED' ? 'LATE_SUPERSEDED_PAYMENT' : 'DUPLICATE_PAYMENT',
              status: 'OPEN',
              details: {
                amountMinor: event.amountMinor,
                renewalSequence: invoice.renewalSequence,
                entitlementGranted: false,
              },
            },
          });
        }
        return { duplicate: false, invoice, transaction, reconciliationRequired: true };
      }
      const subscription = await tx.subscription.findUniqueOrThrow({
        where: { id: invoice.subscriptionId },
      });
      const period = nextPaidPeriod(subscription, paidAt);
      // Paid trial conversion ends the unused trial. Its historical row remains.
      if (subscription.status === 'TRIALING')
        await tx.entitlement.updateMany({
          where: { subscriptionId: subscription.id, renewalSequence: 0, revokedAt: null },
          data: { revokedAt: paidAt },
        });
      await tx.entitlement.create({
        data: {
          organizationId: invoice.organizationId,
          subscriptionId: subscription.id,
          renewalSequence: invoice.renewalSequence,
          planVersionId: invoice.planVersionId,
          invoiceId: invoice.id,
          startsAt: period.start,
          endsAt: period.end,
        },
      });
      const fulfilled = await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: 'PAID',
          fulfilledAt: paidAt,
          fulfilledTransactionId: transaction.id,
          periodStart: period.start,
          periodEnd: period.end,
        },
      });
      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          status: 'ACTIVE',
          currentPeriodStart:
            period.start <= paidAt ? period.start : subscription.currentPeriodStart,
          currentPeriodEnd: period.end,
          anchorDay: period.anchorDay,
          renewalSequence: Math.max(subscription.renewalSequence, invoice.renewalSequence + 1),
          cancelAtPeriodEnd: false,
          ...(period.start <= paidAt ? { planVersionId: invoice.planVersionId } : {}),
          version: { increment: 1 },
        },
      });
      await tx.outboxEvent.create({
        data: {
          type: 'billing.fulfilled',
          aggregateId: invoice.id,
          organizationId: invoice.organizationId,
          dedupeKey: `billing.fulfilled:${subscription.id}:${invoice.renewalSequence}`,
          payload: {
            organizationId: invoice.organizationId,
            invoiceId: invoice.id,
            transactionId: transaction.id,
            renewalSequence: invoice.renewalSequence,
            periodStart: period.start.toISOString(),
            periodEnd: period.end.toISOString(),
          },
        },
      });
      await this.audit(
        tx,
        event.verifiedById ?? null,
        invoice.organizationId,
        'invoice.fulfilled',
        invoice.id,
        {
          provider: event.provider,
          transactionId: transaction.id,
          amountMinor: event.amountMinor,
          ...(event.evidenceFileId ? { evidenceFileId: event.evidenceFileId } : {}),
        },
        event.verificationReason,
      );
      return { duplicate: false, invoice: fulfilled, transaction };
    });
  }

  async refund(user: AuthUser, transactionId: string, reason: string) {
    this.permissions.requirePlatform(user, 'billing.refund');
    const payment = await this.db.providerTransaction.findUnique({ where: { id: transactionId } });
    if (!payment) throw new NotFoundException();
    if (payment.provider !== 'MOCK')
      throw new ServiceUnavailableException(
        'Provider refund sozlanmagan; moliya tekshiruvi talab qilinadi',
      );
    await this.assertSynthetic(payment.organizationId);
    return this.db.$transaction(async (tx) => {
      const originalInvoice = await tx.invoice.findUniqueOrThrow({
        where: { id: payment.invoiceId },
      });
      await tx.$queryRaw`SELECT id FROM "Subscription" WHERE id = ${originalInvoice.subscriptionId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "ProviderTransaction" WHERE id = ${transactionId}::uuid FOR UPDATE`;
      const existing = await tx.refund.findUnique({ where: { transactionId } });
      if (existing) return existing;
      const current = await tx.providerTransaction.findUniqueOrThrow({
        where: { id: transactionId },
      });
      if (current.status !== 'SUCCESS')
        throw new ConflictException('Faqat muvaffaqiyatli to‘lov to‘liq qaytariladi');
      const refund = await tx.refund.create({
        data: {
          organizationId: current.organizationId,
          invoiceId: current.invoiceId,
          transactionId,
          amountMinor: current.amountMinor,
          reason,
          status: 'SUCCESS',
          requestedById: user.id,
        },
      });
      await tx.providerTransaction.update({
        where: { id: transactionId },
        data: { status: 'REFUNDED', rawStatus: 'REFUNDED' },
      });
      // Refunding a duplicate transaction does not revoke the originally purchased entitlement.
      if (originalInvoice.fulfilledTransactionId === transactionId) {
        const now = new Date();
        await tx.invoice.update({ where: { id: current.invoiceId }, data: { status: 'REFUNDED' } });
        await tx.entitlement.updateMany({
          where: { invoiceId: current.invoiceId },
          data: { revokedAt: now },
        });
        const remaining = await tx.entitlement.findMany({
          where: {
            subscriptionId: originalInvoice.subscriptionId,
            revokedAt: null,
            endsAt: { gt: now },
          },
          orderBy: { endsAt: 'desc' },
        });
        await tx.subscription.update({
          where: { id: originalInvoice.subscriptionId },
          data: {
            currentPeriodEnd: remaining[0]?.endsAt ?? now,
            status: remaining.length ? 'ACTIVE' : 'EXPIRED',
            version: { increment: 1 },
          },
        });
      }
      await tx.reconciliationCase.updateMany({
        where: { transactionId, status: 'OPEN' },
        data: { status: 'RESOLVED' },
      });
      await this.audit(
        tx,
        user.id,
        current.organizationId,
        'payment.refund',
        transactionId,
        { amountMinor: current.amountMinor.toString(), provider: 'MOCK' },
        reason,
      );
      await tx.outboxEvent.create({
        data: {
          type: 'billing.refunded',
          aggregateId: refund.id,
          organizationId: current.organizationId,
          dedupeKey: `billing.refunded:${refund.id}`,
          payload: {
            organizationId: current.organizationId,
            invoiceId: current.invoiceId,
            refundId: refund.id,
          },
        },
      });
      return refund;
    });
  }

  async financeQueue(user: AuthUser) {
    this.permissions.requirePlatform(user, 'billing.reconcile');
    const [cases, pending, refunds] = await Promise.all([
      this.db.reconciliationCase.findMany({
        where: { status: 'OPEN' },
        take: 100,
        orderBy: { createdAt: 'asc' },
      }),
      this.db.paymentAttempt.findMany({
        where: { status: 'PENDING' },
        take: 100,
        orderBy: { createdAt: 'asc' },
      }),
      this.db.refund.findMany({ take: 100, orderBy: { createdAt: 'desc' } }),
    ]);
    return { cases, pending, refunds };
  }

  async submitBankEvidence(user: AuthUser, attemptId: string, input: BankEvidenceDto) {
    const attempt = await this.db.paymentAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    await this.permissions.requireOrg(user.id, attempt.organizationId, 'billing.manage');
    if (attempt.provider !== 'BANK' || attempt.status !== 'PENDING')
      throw new ConflictException('Bank payment attempt holati mos emas');
    return this.db.$transaction(async (tx) => {
      const file = await tx.fileAsset.findUnique({ where: { id: input.evidenceFileId } });
      if (
        !file ||
        file.ownerId !== user.id ||
        file.status !== 'CLEAN' ||
        (file.organizationId && file.organizationId !== attempt.organizationId)
      )
        throw new ForbiddenException('Toza va o‘zingizga tegishli dalil fayli talab qilinadi');
      await tx.fileAsset.update({
        where: { id: file.id },
        data: { organizationId: attempt.organizationId },
      });
      await tx.privateDocument.upsert({
        where: { fileId: file.id },
        create: { fileId: file.id, userId: user.id, purpose: 'BANK_EVIDENCE' },
        update: { purpose: 'BANK_EVIDENCE' },
      });
      const evidence = await tx.reconciliationCase.create({
        data: {
          organizationId: attempt.organizationId,
          invoiceId: attempt.invoiceId,
          kind: 'BANK_EVIDENCE',
          status: 'OPEN',
          details: {
            attemptId,
            bankReference: input.bankReference,
            evidenceFileId: file.id,
            submittedById: user.id,
            bankVerified: false,
          },
        },
      });
      await this.audit(
        tx,
        user.id,
        attempt.organizationId,
        'bank.evidence-submitted',
        attempt.invoiceId,
        { caseId: evidence.id, evidenceFileId: file.id },
      );
      return {
        case: evidence,
        paymentStatus: 'PENDING',
        message: 'Dalil yuborildi. To‘lov hali tasdiqlanmagan.',
      };
    });
  }

  async confirmBank(user: AuthUser, attemptId: string, input: BankConfirmDto) {
    this.permissions.requirePlatform(user, 'billing.reconcile');
    if (
      !input.independentlyVerified ||
      !process.env.BANK_ACCOUNT_REFERENCE ||
      !process.env.BANK_BENEFICIARY
    )
      throw new ForbiddenException(
        'Bank tushumini mustaqil tekshirish va rekvizitlar talab qilinadi',
      );
    const attempt = await this.db.paymentAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    if (attempt.provider !== 'BANK') throw new ConflictException('Bu bank attempt emas');
    const evidence = await this.db.reconciliationCase.findFirst({
      where: {
        invoiceId: attempt.invoiceId,
        kind: 'BANK_EVIDENCE',
        details: { path: ['evidenceFileId'], equals: input.evidenceFileId },
      },
    });
    const file = await this.db.fileAsset.findUnique({ where: { id: input.evidenceFileId } });
    if (
      !evidence ||
      !file ||
      file.status !== 'CLEAN' ||
      file.organizationId !== attempt.organizationId
    )
      throw new ForbiddenException('Bank dalili mos emas');
    const reference = payloadHash(input.bankReference.trim());
    const result = await this.receiveVerifiedEvent({
      provider: 'BANK',
      environment: attempt.environment,
      providerTransactionId: `bank-${reference}`,
      attemptId,
      eventKey: `bank-${reference}:confirmed`,
      status: 'SUCCESS',
      amountMinor: input.amountMinor,
      currency: 'UZS',
      verifiedById: user.id,
      verificationReason: input.reason,
      evidenceFileId: input.evidenceFileId,
    });
    await this.db.reconciliationCase.update({
      where: { id: evidence.id },
      data: { status: 'RESOLVED' },
    });
    return result;
  }

  private audit(
    tx: Prisma.TransactionClient,
    actorId: string | null,
    organizationId: string,
    action: string,
    resourceId: string,
    metadata: Prisma.InputJsonValue,
    reason?: string,
  ) {
    return tx.auditLog.create({
      data: { actorId, organizationId, action, resourceId, metadata, reason },
    });
  }
}
