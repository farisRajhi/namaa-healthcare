import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import {
  halalasToDecimal,
  decimalPlaces,
  formatAmountForSignature,
  mapStatus,
  buildSignedString,
  computeHashstring,
  verifyWebhookSignature,
  TapWebhookEvent,
} from '../../src/services/tap.js';

describe('tap service — amount helpers', () => {
  it('halalasToDecimal converts SAR halalas to 2 dp decimal', () => {
    expect(halalasToDecimal(29900, 'SAR')).toBe(299);
    expect(halalasToDecimal(49900, 'SAR')).toBe(499);
    expect(halalasToDecimal(79950, 'SAR')).toBe(799.5);
  });

  it('decimalPlaces returns 3 for KWD/BHD/OMR, 0 for JPY, 2 otherwise', () => {
    expect(decimalPlaces('SAR')).toBe(2);
    expect(decimalPlaces('KWD')).toBe(3);
    expect(decimalPlaces('BHD')).toBe(3);
    expect(decimalPlaces('JPY')).toBe(0);
    expect(decimalPlaces('ZZZ')).toBe(2);
  });

  it('formatAmountForSignature pads with trailing zeros per currency', () => {
    expect(formatAmountForSignature(299, 'SAR')).toBe('299.00');
    expect(formatAmountForSignature(299.5, 'SAR')).toBe('299.50');
    expect(formatAmountForSignature('299', 'SAR')).toBe('299.00');
    expect(formatAmountForSignature(10.1, 'KWD')).toBe('10.100');
  });
});

describe('tap service — status mapping', () => {
  it('maps CAPTURED → paid', () => {
    expect(mapStatus('CAPTURED')).toBe('paid');
    expect(mapStatus('captured')).toBe('paid');
  });

  it('maps AUTHORIZED → authorized', () => {
    expect(mapStatus('AUTHORIZED')).toBe('authorized');
  });

  it('maps FAILED/DECLINED/TIMEDOUT → failed', () => {
    expect(mapStatus('FAILED')).toBe('failed');
    expect(mapStatus('DECLINED')).toBe('failed');
    expect(mapStatus('TIMEDOUT')).toBe('failed');
  });

  it('maps REFUNDED → refunded, CANCELLED/VOID → cancelled', () => {
    expect(mapStatus('REFUNDED')).toBe('refunded');
    expect(mapStatus('CANCELLED')).toBe('cancelled');
    expect(mapStatus('VOID')).toBe('cancelled');
  });

  it('defaults unknown / INITIATED → pending', () => {
    expect(mapStatus('INITIATED')).toBe('pending');
    expect(mapStatus('SOMETHING_NEW')).toBe('pending');
    expect(mapStatus('')).toBe('pending');
  });
});

describe('tap service — webhook signature', () => {
  const secret = 'sk_test_FAKE_SECRET_FOR_TESTS';
  const baseEvent: TapWebhookEvent = {
    id: 'chg_TS05A5220251759Qa4604205474',
    amount: 299,
    currency: 'SAR',
    status: 'CAPTURED',
    created: 1730000000000,
    reference: { gateway: 'gw_ref_1', payment: 'pay_ref_1' },
  };

  it('buildSignedString follows x_id…x_created format with currency-correct decimals', () => {
    const s = buildSignedString(baseEvent);
    expect(s).toBe(
      'x_idchg_TS05A5220251759Qa4604205474' +
        'x_amount299.00' +
        'x_currencySAR' +
        'x_gateway_referencegw_ref_1' +
        'x_payment_referencepay_ref_1' +
        'x_statusCAPTURED' +
        'x_created1730000000000',
    );
  });

  it('computeHashstring produces HMAC-SHA256 hex of the signed string', () => {
    const hash = computeHashstring(baseEvent, secret);
    const expected = crypto
      .createHmac('sha256', secret)
      .update(buildSignedString(baseEvent))
      .digest('hex');
    expect(hash).toBe(expected);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('verifyWebhookSignature accepts a correct hashstring', () => {
    const hash = computeHashstring(baseEvent, secret);
    expect(verifyWebhookSignature(baseEvent, hash, secret)).toBe(true);
  });

  it('verifyWebhookSignature rejects a tampered body', () => {
    const hash = computeHashstring(baseEvent, secret);
    const tampered: TapWebhookEvent = { ...baseEvent, amount: 1 };
    expect(verifyWebhookSignature(tampered, hash, secret)).toBe(false);
  });

  it('verifyWebhookSignature rejects a wrong secret', () => {
    const hash = computeHashstring(baseEvent, secret);
    expect(verifyWebhookSignature(baseEvent, hash, 'different_secret')).toBe(false);
  });

  it('verifyWebhookSignature rejects empty / missing hashstring', () => {
    expect(verifyWebhookSignature(baseEvent, '', secret)).toBe(false);
    expect(verifyWebhookSignature(baseEvent, 'abc', secret)).toBe(false);
  });

  it('handles missing reference fields by using empty strings', () => {
    const evt: TapWebhookEvent = {
      id: 'chg_x',
      amount: 100,
      currency: 'SAR',
      status: 'FAILED',
      created: 1,
    };
    const s = buildSignedString(evt);
    expect(s).toContain('x_gateway_reference');
    expect(s).toContain('x_payment_reference');
    const hash = computeHashstring(evt, secret);
    expect(verifyWebhookSignature(evt, hash, secret)).toBe(true);
  });
});
