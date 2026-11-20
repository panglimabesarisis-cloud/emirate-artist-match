import { describe, expect, it } from 'vitest';
import { fonnteDecision, fonnteTimestamp, selectFonnteBooking, sameWhatsAppPhone } from './fonnte-rules';

describe('Fonnte artist decisions', () => {
  it('accepts YES, 1 and SETUJU', () => {
    for (const text of ['YES', 'yes', '1', 'SETUJU']) expect(fonnteDecision(text)?.decision).toBe('yes');
  });
  it('accepts NO, 2 and TOLAK', () => {
    for (const text of ['NO', 'no', '2', 'TOLAK']) expect(fonnteDecision(text)?.decision).toBe('no');
  });
  it('requires an explicit decision, not unrelated conversation', () => {
    expect(fonnteDecision('yes maybe later')).toBeNull();
    expect(fonnteDecision('I said no')).toBeNull();
  });
  it('extracts a booking reference', () => expect(fonnteDecision('YES A1234567')).toEqual({decision:'yes',code:'a1234567'}));
  it('matches local UAE recipient formats', () => expect(sameWhatsAppPhone('0501234567', '+971501234567')).toBe(true));
  it('rejects a different sender', () => expect(sameWhatsAppPhone('0501234567', '971501234568')).toBe(false));
  const rows = [{id:'a1234567-0000-0000-0000-000000000001',created_at:'2026-11-20T10:00:00Z'}, {id:'b1234567-0000-0000-0000-000000000002',created_at:'2026-11-20T10:00:00Z'}];
  it('does not guess among multiple pending bookings', () => expect(selectFonnteBooking(rows,null,'2026-11-20T11:00:00Z')).toBeNull());
  it('selects the explicit booking reference', () => expect(selectFonnteBooking(rows,'b1234567','2026-11-20T11:00:00Z')?.id).toBe(rows[1]?.id));
  it('rejects replies sent before the offer existed', () => expect(selectFonnteBooking(rows,'a1234567','2026-11-20T09:00:00Z')).toBeNull());
  it('normalizes provider seconds and milliseconds', () => expect(fonnteTimestamp(1795172400)).toBe(fonnteTimestamp(1795172400000)));
});