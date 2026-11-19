import { describe, it, expect } from 'vitest';
import { bookingPayment, reminderDue } from './booking-payment-rules';
describe('booking deposits', () => {
 it('charges DP 20% including VAT', () => { expect(bookingPayment(1050,0,20).dueMinor).toBe(21000); });
 it('charges only the remaining 80%', () => { expect(bookingPayment(1050,210,20)).toEqual({dueMinor:84000,balance:840,percent:20}); });
 it('records 100% paid with no balance', () => { expect(bookingPayment(1050,1050,20)).toEqual({dueMinor:0,balance:0,percent:100}); });
 it('reminds on H-7 only, in UAE time', () => { const now=new Date('2026-11-19T22:00:00Z'); expect(reminderDue('2026-11-27','confirmed',1050,210,now)).toBe(true); expect(reminderDue('2026-11-26','confirmed',1050,210,now)).toBe(false); });
 it('does not remind paid or cancelled bookings', () => { const now=new Date('2026-11-20T08:00:00Z'); expect(reminderDue('2026-11-27','confirmed',1050,1050,now)).toBe(false); expect(reminderDue('2026-11-27','cancelled',1050,210,now)).toBe(false); });
});
