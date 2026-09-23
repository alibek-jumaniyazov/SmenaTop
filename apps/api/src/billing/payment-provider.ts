export interface PaymentProviderCapabilities {
  checkout: boolean;
  refund: boolean;
  recurring: boolean;
}

/** Provider code never receives worker wages. Only subscription invoice payment attempts belong here. */
export interface PaymentProvider {
  readonly id: string;
  readonly reconciliationMode: 'PROVIDER_PUSH' | 'MANUAL';
  capabilities(): PaymentProviderCapabilities;
  checkout(attemptId: string, amountMinor: bigint): string | null;
  authenticate(authorization: string | undefined): boolean;
  storedStatus(
    providerTransactionId: string,
  ): Promise<{ status: string; rawStatus: string } | null>;
}

export function paymeConfiguration() {
  const environment = process.env.PAYME_ENVIRONMENT;
  const enabled = process.env.PAYME_ENABLED === 'true';
  const merchantId = process.env.PAYME_MERCHANT_ID;
  const login = process.env.PAYME_LOGIN;
  const key = process.env.PAYME_KEY;
  const configured =
    enabled &&
    Boolean(merchantId && login && key) &&
    (environment === 'SANDBOX' || environment === 'LIVE');
  const production = process.env.APP_ENV === 'production' || process.env.NODE_ENV === 'production';
  if (
    configured &&
    ((production && environment !== 'LIVE') || (!production && environment === 'LIVE'))
  )
    throw new Error('PAYME_ENVIRONMENT conflicts with application environment');
  return { configured, environment, merchantId, login, key };
}

export function paymeCheckout(attemptId: string, amountMinor: bigint): string {
  const config = paymeConfiguration();
  if (!config.configured) throw new Error('NOT_CONFIGURED');
  if (amountMinor <= 0n || amountMinor > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error('INVALID_AMOUNT');
  const params = `m=${config.merchantId};ac.order_id=${attemptId};a=${amountMinor};l=uz`;
  return `${config.environment === 'SANDBOX' ? 'https://test.paycom.uz' : 'https://checkout.paycom.uz'}/${Buffer.from(params).toString('base64')}`;
}
