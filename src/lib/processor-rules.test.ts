import {describe,it,expect} from 'vitest';
import {testProcessorAmount,refundEscrowStatus} from './processor-rules';
describe('processor accounting',()=>{
  it('charges AED105 as IDR514500 in Stripe minor units',()=>expect(testProcessorAmount(10500)).toBe(51450000));
  it('charges AED5250 without truncating processor amounts to 32 bits',()=>expect(testProcessorAmount(525000)).toBe(2572500000));
  it('rejects non-integral AED fils',()=>expect(()=>testProcessorAmount(1.5)).toThrow());
  it('does not classify a zero refund as refunded',()=>expect(refundEscrowStatus(100,0)).toBe('held'));
});