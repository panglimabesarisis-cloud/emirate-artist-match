import { describe, expect, it } from 'vitest';
import { revisionIntent, revisionReference, validateRevision } from './whatsapp-revision';
import { priceBreakdown } from './booking-rules';

describe('artist WhatsApp revisions', () => {
  it('recognises Indonesian price and note revisions', () => {
    expect(revisionIntent('Ubah harga jadi AED 7,000')).toBe(true);
    expect(revisionIntent('Tambah notes: biaya transport')).toBe(true);
    expect(revisionIntent('YES')).toBe(false);
  });
  it('accepts only the explicit AED replacement price', () => {
    const proposal = validateRevision('Tolong revisi harganya jadi AED 7,000, ada biaya transport', {amount:7000,note:'ada biaya transport'});
    expect(proposal).toEqual({amount:7000,note:'ada biaya transport'});
    expect(priceBreakdown(proposal.amount ?? 0)).toEqual({subtotal:7000,vat:350,total:7350});
  });
  it('allows adding notes without changing the price', () => {
    expect(validateRevision('Tambah notes: wajib briefing online', {amount:null,note:'wajib briefing online'})).toEqual({amount:null,note:'wajib briefing online'});
  });
  it('rejects an invented price or guest count interpreted as money', () => {
    expect(() => validateRevision('Ubah harga jadi AED 7,000', {amount:5000,note:null})).toThrow();
    expect(() => validateRevision('Tambah notes: 2000 tamu', {amount:2000,note:null})).toThrow();
  });
  it('requires clarification for multiple prices, inclusive totals or extra charges', () => {
    for (const message of ['Ubah harga AED 5,000 atau AED 7,000','Ubah total jadi AED 7,000 termasuk VAT','Update price additional AED 7,000']) {
      expect(() => validateRevision(message,{amount:7000,note:null})).toThrow();
    }
  });
  it('does not allow AI to invent or rewrite the artist note', () => {
    expect(() => validateRevision('Tambah notes: biaya transport', {amount:null,note:'transport is included'})).toThrow();
  });
  it('can identify a specified order without guessing from other numbers', () => {
    expect(revisionReference('Reference Order: 78364973 Ubah harga jadi AED 7,000')).toBe('78364973');
    expect(revisionReference('Ubah harga jadi AED 7,000')).toBeNull();
  });
});