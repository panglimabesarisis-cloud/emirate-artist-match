import {describe,it,expect} from 'vitest';
import {PLAN_LOOKUP_KEYS,canAddUsage,monthlyCreditDelta,planDirection,verifiedPaidPeriod} from './billing-rules';
describe('confirmed subscription rules',()=>{
 it('keeps stable monthly and annual plan identifiers',()=>expect(PLAN_LOOKUP_KEYS.pro.year).toBe('pro_yearly'));
 it('keeps existing excess content but disallows additions',()=>{expect(canAddUsage(10,5)).toBe(false);expect(canAddUsage(4,5)).toBe(true);});
 it('permits unlimited Pro team seats',()=>expect(canAddUsage(100,-1)).toBe(true));
 it('grants Medium200 and Pro500 without repeating same-month allocations',()=>{expect(monthlyCreditDelta(50,200)).toBe(150);expect(monthlyCreditDelta(200,500)).toBe(300);expect(monthlyCreditDelta(500,200)).toBe(0);});
 it('treats Medium to Pro as immediate upgrade and Pro to Free as downgrade',()=>{expect(planDirection('medium','pro')).toBe('upgrade');expect(planDirection('pro','free')).toBe('downgrade');});
});
describe('verified paid subscription periods',()=>{
 const invoice={status:'paid',currency:'idr',livemode:false,customer:'customer-1',subscription:'sub-1'};
 const line={currency:'idr',livemode:false,amount:102385500,quantity:1,subscription:'sub-1',start:1795132800,end:1797724800};
 const identity={customer:'customer-1',subscription:'sub-1'};
 it('uses the paid line period, not invoice creation or billing summary dates',()=>expect(verifiedPaidPeriod(invoice,line,identity)).toEqual({start:1795132800,end:1797724800}));
 it('never grants an unpaid renewal',()=>expect(verifiedPaidPeriod({...invoice,status:'open'},line,identity)).toBeNull());
 it('rejects another customer payment',()=>expect(verifiedPaidPeriod({...invoice,customer:'customer-2'},line,identity)).toBeNull());
 it('rejects another subscription line',()=>expect(verifiedPaidPeriod(invoice,{...line,subscription:'sub-2'},identity)).toBeNull());
 it('ignores negative upgrade credits',()=>expect(verifiedPaidPeriod(invoice,{...line,amount:-100},identity)).toBeNull());
 it('rejects live payments',()=>expect(verifiedPaidPeriod({...invoice,livemode:true},line,identity)).toBeNull());
});