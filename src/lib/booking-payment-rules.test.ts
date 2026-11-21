import { describe, it, expect } from 'vitest';
import { bookingPayment, canCheckoutBooking, reminderDue } from './booking-payment-rules';
describe('booking deposits', () => {
 it('charges DP 20% including VAT', () => { expect(bookingPayment(1050,0,20).dueMinor).toBe(21000); });
 it('charges only the remaining 80%', () => { expect(bookingPayment(1050,210,20)).toMatchObject({dueMinor:84000,dueAmount:840,balance:840,percent:20}); });
 it('records 100% paid with no balance', () => { expect(bookingPayment(1050,1050,20)).toMatchObject({dueMinor:0,dueAmount:0,balance:0,percent:100}); });
 it('shows AED 5000 plus 5% VAT and charges exactly 525000 fils at 100%', () => {
   expect(bookingPayment(5250,0,100)).toMatchObject({subtotal:5000,vatAmount:250,total:5250,dueMinor:525000,dueAmount:5250});
   expect(bookingPayment(5000,0,100,false)).toMatchObject({subtotal:5000,vatAmount:250,total:5250,dueMinor:525000,dueAmount:5250});
 });
 it('blocks checkout until an invoice is issued', () => { expect(canCheckoutBooking(null,525000)).toBe(false); expect(canCheckoutBooking('INV-1',525000)).toBe(true); });
 it('blocks zero, negative and fractional fils', () => { for(const amount of [0,-1,1.5,NaN]) expect(canCheckoutBooking('INV-1',amount)).toBe(false); });
 it('never charges more than the total for an invalid percentage', () => { expect(bookingPayment(5250,0,120).dueMinor).toBe(525000); });
 it('reminds on H-7 only, in UAE time', () => { const now=new Date('2026-11-19T22:00:00Z'); expect(reminderDue('2026-11-27','confirmed',1050,210,now)).toBe(true); expect(reminderDue('2026-11-26','confirmed',1050,210,now)).toBe(false); });
 it('does not remind paid or cancelled bookings', () => { const now=new Date('2026-11-20T08:00:00Z'); expect(reminderDue('2026-11-27','confirmed',1050,1050,now)).toBe(false); expect(reminderDue('2026-11-27','cancelled',1050,210,now)).toBe(false); });
});
