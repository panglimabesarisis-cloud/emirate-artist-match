export const PLAN_LOOKUP_KEYS = {medium:{month:'medium_monthly',year:'medium_yearly'},pro:{month:'pro_monthly',year:'pro_yearly'}} as const;
export type PaidPlan = keyof typeof PLAN_LOOKUP_KEYS;
export type BillingInterval='month'|'year';
export function paidPlan(v:unknown):PaidPlan{if(v!=='medium'&&v!=='pro')throw new Error('Choose Medium or Pro');return v;}
export function billingInterval(v:unknown):BillingInterval{if(v!=='month'&&v!=='year')throw new Error('Choose monthly or yearly billing');return v;}
export function planDirection(current:string,next:string){return (next==='pro'?2:next==='medium'?1:0)>(current==='pro'?2:current==='medium'?1:0)?'upgrade':'downgrade';}
export function canAddUsage(used:number,limit:number){return limit<0||used<limit;}
export function monthlyCreditDelta(allocated:number,entitled:number){return Math.max(0,entitled-allocated);}

export function verifiedPaidPeriod(invoice:{status:string|null;currency:string;livemode:boolean;customer:string|null;subscription:string|null},line:{currency:string;livemode:boolean;amount:number;quantity:number|null;subscription:string|null;start:number;end:number},identity:{customer:string;subscription:string}){
 if(invoice.status!=='paid'||invoice.currency!=='idr'||invoice.livemode||invoice.customer!==identity.customer||invoice.subscription!==identity.subscription)return null;
 if(line.currency!=='idr'||line.livemode||line.amount<0||line.quantity!==1||line.subscription!==identity.subscription||!Number.isFinite(line.start)||!Number.isFinite(line.end)||line.end<=line.start)return null;
 return {start:line.start,end:line.end};
}