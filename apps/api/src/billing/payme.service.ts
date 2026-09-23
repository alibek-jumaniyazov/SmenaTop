import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import type { ProviderTransaction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BillingService } from './billing.service';
import { constantTimeEquals } from './billing.rules';
import { paymeCheckout, paymeConfiguration } from './payment-provider';
import type { PaymentProvider } from './payment-provider';

class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: string,
  ) {
    super(message);
  }
}
type Params = Record<string, unknown>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const timeoutMs = 43_200_000;

@Injectable()
export class PaymeService implements PaymentProvider {
  readonly id = 'PAYME';
  readonly reconciliationMode = 'PROVIDER_PUSH' as const;
  constructor(
    private readonly db: PrismaService,
    private readonly billing: BillingService,
  ) {}

  capabilities() {
    return { checkout: paymeConfiguration().configured, refund: false, recurring: false };
  }
  checkout(attemptId: string, amountMinor: bigint) {
    return paymeCheckout(attemptId, amountMinor);
  }
  authenticate(authorization: string | undefined) {
    const config = paymeConfiguration();
    return (
      config.configured &&
      Boolean(authorization) &&
      constantTimeEquals(
        authorization!,
        `Basic ${Buffer.from(`${config.login}:${config.key}`).toString('base64')}`,
      )
    );
  }
  storedStatus(providerTransactionId: string) {
    return this.db.providerTransaction.findUnique({
      where: {
        provider_environment_providerTransactionId: {
          provider: 'PAYME',
          environment: paymeConfiguration().environment ?? 'UNCONFIGURED',
          providerTransactionId,
        },
      },
      select: { status: true, rawStatus: true },
    });
  }

  async rpc(authorization: string | undefined, body: unknown) {
    let id: unknown = null;
    try {
      if (body && typeof body === 'object' && Number.isSafeInteger((body as Params).id))
        id = (body as Params).id;
      const config = paymeConfiguration();
      if (!config.configured) throw new RpcError(-32504, 'NOT_CONFIGURED');
      if (!this.authenticate(authorization)) throw new RpcError(-32504, 'Insufficient privileges');
      if (!body || typeof body !== 'object' || Array.isArray(body))
        throw new RpcError(-32600, 'Invalid request');
      const request = body as Record<string, unknown>;
      id = request.id;
      if (
        !Number.isSafeInteger(id) ||
        typeof request.method !== 'string' ||
        !request.params ||
        typeof request.params !== 'object' ||
        Array.isArray(request.params)
      )
        throw new RpcError(-32600, 'Invalid request');
      const params = request.params as Params;
      let result: unknown;
      switch (request.method) {
        case 'CheckPerformTransaction':
          await this.checkAccount(params);
          result = { allow: true };
          break;
        case 'CreateTransaction':
          result = await this.create(params);
          break;
        case 'PerformTransaction':
          result = await this.perform(params);
          break;
        case 'CancelTransaction':
          result = await this.cancel(params);
          break;
        case 'CheckTransaction':
          result = this.state(await this.find(params));
          break;
        case 'GetStatement':
          result = await this.statement(params);
          break;
        default:
          throw new RpcError(-32601, 'Method not found', request.method);
      }
      return { jsonrpc: '2.0', id, result };
    } catch (error) {
      const rpc = error instanceof RpcError ? error : new RpcError(-32400, 'System error');
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: rpc.code,
          message: { uz: rpc.message, ru: rpc.message, en: rpc.message },
          ...(rpc.data ? { data: rpc.data } : {}),
        },
      };
    }
  }

  private transactionId(params: Params) {
    if (typeof params.id !== 'string' || params.id.length !== 24)
      throw new RpcError(-32600, 'Invalid transaction ID');
    return params.id;
  }

  private accountId(params: Params) {
    const account = params.account;
    if (
      !account ||
      typeof account !== 'object' ||
      typeof (account as Params).order_id !== 'string' ||
      !uuid.test((account as Params).order_id as string)
    )
      throw new RpcError(-31050, 'Order not found', 'order_id');
    return (account as Params).order_id as string;
  }

  private amount(params: Params) {
    if (!Number.isSafeInteger(params.amount) || (params.amount as number) <= 0)
      throw new RpcError(-31001, 'Invalid amount');
    return BigInt(params.amount as number);
  }

  private async checkAccount(params: Params) {
    const attemptId = this.accountId(params),
      amount = this.amount(params);
    const attempt = await this.db.paymentAttempt.findUnique({
      where: { id: attemptId },
      include: { invoice: true },
    });
    const config = paymeConfiguration();
    if (!attempt || attempt.provider !== 'PAYME' || attempt.environment !== config.environment)
      throw new RpcError(-31050, 'Order not found', 'order_id');
    if (attempt.invoice.amountMinor !== amount || attempt.invoice.currency !== 'UZS')
      throw new RpcError(-31001, 'Invalid amount');
    if (attempt.invoice.status !== 'PENDING') throw new RpcError(-31008, 'Order cannot be paid');
    return attempt;
  }

  private async find(params: Params) {
    const providerTransactionId = this.transactionId(params);
    const transaction = await this.db.providerTransaction.findUnique({
      where: {
        provider_environment_providerTransactionId: {
          provider: 'PAYME',
          environment: paymeConfiguration().environment!,
          providerTransactionId,
        },
      },
    });
    if (!transaction) throw new RpcError(-31003, 'Transaction not found');
    return transaction;
  }

  private async create(params: Params) {
    const providerTransactionId = this.transactionId(params),
      attemptId = this.accountId(params),
      amount = this.amount(params);
    if (
      !Number.isSafeInteger(params.time) ||
      (params.time as number) < 1_000_000_000_000 ||
      (params.time as number) > 9_999_999_999_999
    )
      throw new RpcError(-32600, 'Invalid time');
    const time = new Date(params.time as number);
    const environment = paymeConfiguration().environment!;
    // Serialize provider IDs even when a malicious callback references a different invoice.
    const result = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`payme:${environment}:${providerTransactionId}`},0))`;
      let existing = await tx.providerTransaction.findUnique({
        where: {
          provider_environment_providerTransactionId: {
            provider: 'PAYME',
            environment,
            providerTransactionId,
          },
        },
      });
      if (existing) {
        const existingInvoice = await tx.invoice.findUniqueOrThrow({
          where: { id: existing.invoiceId },
        });
        await tx.$queryRaw`SELECT id FROM "Subscription" WHERE id = ${existingInvoice.subscriptionId}::uuid FOR UPDATE`;
        existing = await tx.providerTransaction.findUniqueOrThrow({ where: { id: existing.id } });
        if (existing.paymentAttemptId !== attemptId)
          throw new RpcError(-31050, 'Order mismatch', 'order_id');
        if (existing.amountMinor !== amount) throw new RpcError(-31001, 'Invalid amount');
        if (
          existing.status === 'PENDING' &&
          Date.now() - existing.providerCreatedAt!.getTime() >= timeoutMs
        )
          existing = await tx.providerTransaction.update({
            where: { id: existing.id },
            data: {
              status: 'CANCELLED',
              rawStatus: '-1',
              cancelReason: 4,
              cancelledAt: new Date(),
            },
          });
        if (['CANCELLED', 'REFUNDED'].includes(existing.status))
          return { error: true, transaction: existing };
        return { error: false, transaction: existing };
      }
      const attempt = await tx.paymentAttempt.findUnique({
        where: { id: attemptId },
        include: { invoice: true },
      });
      if (!attempt || attempt.provider !== 'PAYME' || attempt.environment !== environment)
        throw new RpcError(-31050, 'Order not found', 'order_id');
      await tx.$queryRaw`SELECT id FROM "Subscription" WHERE id = ${attempt.invoice.subscriptionId}::uuid FOR UPDATE`;
      const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: attempt.invoiceId } });
      if (invoice.amountMinor !== amount || invoice.currency !== 'UZS')
        throw new RpcError(-31001, 'Invalid amount');
      if (invoice.status !== 'PENDING') throw new RpcError(-31008, 'Order cannot be paid');
      const active = await tx.providerTransaction.findFirst({
        where: { invoiceId: invoice.id, provider: 'PAYME', status: { in: ['PENDING', 'SUCCESS'] } },
      });
      if (active) throw new RpcError(-31008, 'Another transaction is active');
      const expired = Date.now() - time.getTime() >= timeoutMs;
      const transaction = await tx.providerTransaction.create({
        data: {
          organizationId: attempt.organizationId,
          invoiceId: invoice.id,
          paymentAttemptId: attempt.id,
          provider: 'PAYME',
          environment,
          providerTransactionId,
          providerCreatedAt: time,
          amountMinor: amount,
          currency: 'UZS',
          status: expired ? 'CANCELLED' : 'PENDING',
          rawStatus: expired ? '-1' : '1',
          ...(expired ? { cancelReason: 4, cancelledAt: new Date() } : {}),
        },
      });
      return { error: expired, transaction };
    });
    if (result.error) throw new RpcError(-31008, 'Transaction cancelled');
    return {
      create_time: result.transaction.createdAt.getTime(),
      transaction: result.transaction.id,
      state: this.state(result.transaction).state,
    };
  }

  private async perform(params: Params) {
    let transaction = await this.find(params);
    if (transaction.status === 'SUCCESS')
      return { transaction: transaction.id, perform_time: transaction.paidAt!.getTime(), state: 2 };
    if (transaction.status !== 'PENDING')
      throw new RpcError(-31008, 'Transaction cannot be performed');
    if (Date.now() - transaction.providerCreatedAt!.getTime() >= timeoutMs) {
      await this.cancel({ ...params, reason: 4 });
      throw new RpcError(-31008, 'Transaction expired');
    }
    try {
      await this.billing.receiveVerifiedEvent({
        provider: 'PAYME',
        environment: transaction.environment,
        providerTransactionId: transaction.providerTransactionId,
        attemptId: transaction.paymentAttemptId,
        eventKey: `${transaction.providerTransactionId}:perform`,
        status: 'SUCCESS',
        amountMinor: transaction.amountMinor.toString(),
        currency: transaction.currency,
      });
    } catch (error) {
      if (error instanceof ConflictException || error instanceof BadRequestException)
        throw new RpcError(-31008, 'Transaction cannot be performed');
      throw error;
    }
    transaction = await this.find(params);
    return { transaction: transaction.id, perform_time: transaction.paidAt!.getTime(), state: 2 };
  }

  private async cancel(params: Params) {
    if (!Number.isInteger(params.reason) || ![1, 2, 3, 4, 5, 10].includes(params.reason as number))
      throw new RpcError(-32600, 'Invalid cancellation reason');
    const payment = await this.find(params);
    const invoice = await this.db.invoice.findUniqueOrThrow({ where: { id: payment.invoiceId } });
    const cancelled = await this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Subscription" WHERE id = ${invoice.subscriptionId}::uuid FOR UPDATE`;
      const lockedInvoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
      const current = await tx.providerTransaction.findUniqueOrThrow({ where: { id: payment.id } });
      if (['CANCELLED', 'REFUNDED'].includes(current.status)) return current;
      const now = new Date();
      if (current.status === 'SUCCESS') {
        if (lockedInvoice.fulfilledTransactionId === current.id) {
          const entitlement = await tx.entitlement.findUnique({ where: { invoiceId: invoice.id } });
          // Entire service already consumed: documented -31007. A future/active period can be revoked in full.
          if (entitlement && entitlement.endsAt <= now)
            throw new RpcError(-31007, 'Service fully delivered');
          await tx.entitlement.updateMany({
            where: { invoiceId: invoice.id },
            data: { revokedAt: now },
          });
          await tx.invoice.update({ where: { id: invoice.id }, data: { status: 'REFUNDED' } });
          const remaining = await tx.entitlement.findFirst({
            where: { subscriptionId: invoice.subscriptionId, revokedAt: null, endsAt: { gt: now } },
            orderBy: { endsAt: 'desc' },
          });
          await tx.subscription.update({
            where: { id: invoice.subscriptionId },
            data: {
              status: remaining ? 'ACTIVE' : 'EXPIRED',
              currentPeriodEnd: remaining?.endsAt ?? now,
              version: { increment: 1 },
            },
          });
        }
        const refund = await tx.refund.create({
          data: {
            organizationId: current.organizationId,
            invoiceId: current.invoiceId,
            transactionId: current.id,
            amountMinor: current.amountMinor,
            reason: `Payme CancelTransaction reason=${params.reason}`,
            status: 'SUCCESS',
            requestedById: null,
          },
        });
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
      }
      const result = await tx.providerTransaction.update({
        where: { id: current.id },
        data: {
          status: current.status === 'SUCCESS' ? 'REFUNDED' : 'CANCELLED',
          rawStatus: current.status === 'SUCCESS' ? '-2' : '-1',
          cancelReason: params.reason as number,
          cancelledAt: now,
        },
      });
      await tx.paymentAttempt.update({
        where: { id: current.paymentAttemptId },
        data: { status: result.status },
      });
      await tx.auditLog.create({
        data: {
          organizationId: current.organizationId,
          action: 'payme.cancel',
          resourceId: current.id,
          reason: `Provider reason ${params.reason}`,
          metadata: {
            provider: 'PAYME',
            environment: current.environment,
            amountMinor: current.amountMinor.toString(),
            status: result.status,
          },
        },
      });
      return result;
    });
    return {
      transaction: cancelled.id,
      cancel_time: cancelled.cancelledAt!.getTime(),
      state: this.state(cancelled).state,
    };
  }

  private state(transaction: ProviderTransaction) {
    return {
      create_time: transaction.createdAt.getTime(),
      perform_time: transaction.paidAt?.getTime() ?? 0,
      cancel_time: transaction.cancelledAt?.getTime() ?? 0,
      transaction: transaction.id,
      state:
        transaction.status === 'SUCCESS'
          ? 2
          : transaction.status === 'REFUNDED'
            ? -2
            : transaction.status === 'CANCELLED'
              ? -1
              : 1,
      reason: transaction.cancelReason,
    };
  }

  private async statement(params: Params) {
    if (
      !Number.isSafeInteger(params.from) ||
      !Number.isSafeInteger(params.to) ||
      (params.from as number) < 0 ||
      (params.to as number) < (params.from as number)
    )
      throw new RpcError(-32600, 'Invalid period');
    const transactions = await this.db.providerTransaction.findMany({
      where: {
        provider: 'PAYME',
        environment: paymeConfiguration().environment!,
        providerCreatedAt: {
          gte: new Date(params.from as number),
          lte: new Date(params.to as number),
        },
      },
      orderBy: { providerCreatedAt: 'asc' },
    });
    return {
      transactions: transactions.map((transaction) => ({
        id: transaction.providerTransactionId,
        time: transaction.providerCreatedAt!.getTime(),
        amount: Number(transaction.amountMinor),
        account: { order_id: transaction.paymentAttemptId },
        ...this.state(transaction),
      })),
    };
  }
}
