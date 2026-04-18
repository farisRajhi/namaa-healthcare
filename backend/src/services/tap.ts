import crypto from 'crypto';

const TAP_BASE_URL = 'https://api.tap.company/v2';

function secretKey(): string {
  const key = process.env.TAP_SECRET_KEY || '';
  if (!key) throw new Error('TAP_SECRET_KEY is not configured');
  return key;
}

function authHeader(): string {
  return `Bearer ${secretKey()}`;
}

const CURRENCY_DECIMALS: Record<string, number> = {
  SAR: 2, AED: 2, USD: 2, EUR: 2, GBP: 2, EGP: 2, QAR: 2,
  KWD: 3, BHD: 3, OMR: 3,
  JPY: 0,
};

export function decimalPlaces(currency: string): number {
  return CURRENCY_DECIMALS[currency?.toUpperCase()] ?? 2;
}

export function halalasToDecimal(halalas: number, currency = 'SAR'): number {
  const dp = decimalPlaces(currency);
  const factor = 10 ** dp;
  return Number((halalas / factor).toFixed(dp));
}

export function formatAmountForSignature(amount: number | string, currency: string): string {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  return n.toFixed(decimalPlaces(currency));
}

export type TapStatus =
  | 'INITIATED'
  | 'AUTHORIZED'
  | 'CAPTURED'
  | 'FAILED'
  | 'DECLINED'
  | 'CANCELLED'
  | 'VOID'
  | 'TIMEDOUT'
  | 'UNKNOWN'
  | 'REFUNDED';

export type InternalStatus = 'paid' | 'failed' | 'authorized' | 'pending' | 'refunded' | 'cancelled';

export function mapStatus(tapStatus: string): InternalStatus {
  switch ((tapStatus || '').toUpperCase()) {
    case 'CAPTURED':
      return 'paid';
    case 'AUTHORIZED':
      return 'authorized';
    case 'FAILED':
    case 'DECLINED':
    case 'TIMEDOUT':
    case 'UNKNOWN':
      return 'failed';
    case 'REFUNDED':
      return 'refunded';
    case 'CANCELLED':
    case 'VOID':
      return 'cancelled';
    case 'INITIATED':
    default:
      return 'pending';
  }
}

export interface CreateChargeParams {
  amount: number;
  currency: string;
  /** Single-use card token id (tok_xxx) for first-time charges. */
  tokenId?: string;
  /** Saved card id (card_xxx) for renewals — requires customerId. */
  savedCardId?: string;
  /** Tap customer id (cus_xxx) — required when using savedCardId, optional when using tokenId. */
  customerId?: string;
  description?: string;
  customer: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phoneCountryCode?: string;
    phoneNumber?: string;
  };
  redirectUrl: string;
  webhookUrl: string;
  metadata?: Record<string, unknown>;
  /** Persist the card on the customer for future renewals. */
  saveCard?: boolean;
  /** Idempotency key — pass-through to Tap to dedupe accidental retries. */
  idempotencyKey?: string;
}

export interface TapCardSnapshot {
  id?: string;            // card_xxx (saved card id)
  brand?: string;         // VISA / MASTERCARD / MADA / AMEX
  last_four?: string;
  scheme?: string;
}

export interface TapChargeResponse {
  id: string;
  status: string;
  amount: number;
  currency: string;
  customer?: { id?: string };
  card?: TapCardSnapshot;
  source?: { id?: string; payment_method?: string };
  transaction?: { url?: string };
  reference?: { gateway?: string; payment?: string; track?: string };
  response?: { code?: string; message?: string };
  [k: string]: unknown;
}

export async function createCharge(params: CreateChargeParams): Promise<TapChargeResponse> {
  const sourceId =
    params.savedCardId ?? params.tokenId;
  if (!sourceId) {
    throw new Error('createCharge requires either tokenId or savedCardId');
  }
  if (params.savedCardId && !params.customerId) {
    throw new Error('savedCardId requires customerId');
  }

  const body: Record<string, unknown> = {
    amount: params.amount,
    currency: params.currency,
    threeDSecure: true,
    save_card: params.saveCard ?? !params.savedCardId, // default: save on first charge, never on renewals
    description: params.description,
    metadata: params.metadata,
    customer: params.customerId
      ? { id: params.customerId }
      : {
          first_name: params.customer.firstName || 'Customer',
          last_name: params.customer.lastName,
          email: params.customer.email,
          phone: params.customer.phoneNumber
            ? {
                country_code: params.customer.phoneCountryCode || '966',
                number: params.customer.phoneNumber,
              }
            : undefined,
        },
    source: { id: sourceId },
    redirect: { url: params.redirectUrl },
    post: { url: params.webhookUrl },
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: authHeader(),
  };
  if (params.idempotencyKey) {
    headers['Idempotency-Key'] = params.idempotencyKey;
  }

  const response = await fetch(`${TAP_BASE_URL}/charges/`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const data = (await response.json()) as TapChargeResponse;
  if (!response.ok) {
    const err = new Error(
      (data as any)?.errors?.[0]?.description ||
        (data as any)?.response?.message ||
        `Tap charge creation failed (${response.status})`,
    );
    (err as any).details = data;
    (err as any).statusCode = response.status;
    throw err;
  }
  return data;
}

/**
 * Charge a previously saved card (off-session). Used by the dunning/renewal job.
 */
export async function chargeSavedCard(params: {
  customerId: string;
  cardId: string;
  amount: number;
  currency: string;
  description?: string;
  webhookUrl: string;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
}): Promise<TapChargeResponse> {
  return createCharge({
    amount: params.amount,
    currency: params.currency,
    savedCardId: params.cardId,
    customerId: params.customerId,
    description: params.description,
    customer: {},
    redirectUrl: 'https://tawafud.ai/billing',
    webhookUrl: params.webhookUrl,
    metadata: params.metadata,
    saveCard: false,
    idempotencyKey: params.idempotencyKey,
  });
}

export async function retrieveCharge(chargeId: string): Promise<TapChargeResponse> {
  const response = await fetch(`${TAP_BASE_URL}/charges/${encodeURIComponent(chargeId)}`, {
    headers: { Authorization: authHeader() },
  });
  const data = (await response.json()) as TapChargeResponse;
  if (!response.ok) {
    const err = new Error(`Tap charge retrieval failed (${response.status})`);
    (err as any).details = data;
    (err as any).statusCode = response.status;
    throw err;
  }
  return data;
}

/**
 * Pull card / customer ids out of a Tap charge response so we can persist them for renewals.
 */
export function extractCardSnapshot(charge: TapChargeResponse): {
  cardId: string | null;
  customerId: string | null;
  brand: string | null;
  lastFour: string | null;
} {
  const cardId =
    charge.card?.id ||
    (typeof charge.source?.id === 'string' && charge.source.id.startsWith('card_')
      ? charge.source.id
      : null) ||
    null;
  const customerId = charge.customer?.id || null;
  const brand = charge.card?.brand || charge.card?.scheme || null;
  const lastFour = charge.card?.last_four || null;
  return { cardId, customerId, brand, lastFour };
}

export interface TapWebhookEvent {
  id: string;
  amount: number | string;
  currency: string;
  status: string;
  created: number | string;
  reference?: { gateway?: string; payment?: string };
  [k: string]: unknown;
}

export function buildSignedString(event: TapWebhookEvent): string {
  const amount = formatAmountForSignature(event.amount, event.currency);
  const gatewayRef = event.reference?.gateway || '';
  const paymentRef = event.reference?.payment || '';
  return (
    `x_id${event.id}` +
    `x_amount${amount}` +
    `x_currency${event.currency}` +
    `x_gateway_reference${gatewayRef}` +
    `x_payment_reference${paymentRef}` +
    `x_status${event.status}` +
    `x_created${event.created}`
  );
}

export function computeHashstring(event: TapWebhookEvent, secret: string): string {
  return crypto.createHmac('sha256', secret).update(buildSignedString(event)).digest('hex');
}

export function verifyWebhookSignature(
  event: TapWebhookEvent,
  hashstring: string,
  secret: string,
): boolean {
  if (!hashstring || !secret) return false;
  const expected = computeHashstring(event, secret);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(hashstring, 'utf8');
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
