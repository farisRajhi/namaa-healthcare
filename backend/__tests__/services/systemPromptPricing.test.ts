import { describe, it, expect } from 'vitest';
import { formatServicePricing } from '../../src/services/systemPrompt.js';

describe('formatServicePricing', () => {
  it('returns empty string when showPrice is false', () => {
    expect(formatServicePricing({ showPrice: false, priceSar: 200 }, 'ar')).toBe('');
  });

  it('returns empty string when showPrice is true but no price or note set', () => {
    expect(formatServicePricing({ showPrice: true }, 'ar')).toBe('');
  });

  it('formats Arabic price with ر.س suffix', () => {
    expect(formatServicePricing({ showPrice: true, priceSar: 200 }, 'ar')).toBe(' — 200 ر.س');
  });

  it('formats English price with SAR suffix', () => {
    expect(formatServicePricing({ showPrice: true, priceSar: 350 }, 'en')).toBe(' — 350 SAR');
  });

  it('appends Arabic note in parentheses when present', () => {
    expect(
      formatServicePricing({ showPrice: true, priceSar: 200, priceNote: 'يختلف حسب الحالة' }, 'ar'),
    ).toBe(' — 200 ر.س (يختلف حسب الحالة)');
  });

  it('prefers English note when lang is en', () => {
    expect(
      formatServicePricing(
        { showPrice: true, priceSar: 500, priceNote: 'يختلف', priceNoteEn: 'Varies' },
        'en',
      ),
    ).toBe(' — 500 SAR (Varies)');
  });

  it('falls back to Arabic note when English note is missing in en mode', () => {
    expect(
      formatServicePricing({ showPrice: true, priceSar: 500, priceNote: 'يختلف' }, 'en'),
    ).toBe(' — 500 SAR (يختلف)');
  });

  it('renders note alone when no price is set', () => {
    expect(
      formatServicePricing({ showPrice: true, priceNote: 'يحدد عند الكشف' }, 'ar'),
    ).toBe(' — (يحدد عند الكشف)');
  });
});
