export const PLAN_LOOKUP_KEYS = {basic:{month:'basic_monthly',year:'basic_yearly'},medium:{month:'medium_monthly',year:'medium_yearly'},pro:{month:'pro_monthly',year:'pro_yearly'}} as const;
export type PaidPlan = keyof typeof PLAN_LOOKUP_KEYS;
export type BillingInterval='month'|'year';
export function paidPlan(v:unknown):PaidPlan{if(v!=='basic'&&v!=='medium'&&v!=='pro')throw new Error('Choose Basic, Medium or Pro');return v;}
export function billingInterval(v:unknown):BillingInterval{if(v!=='month'&&v!=='year')throw new Error('Choose monthly or yearly billing');return v;}
const PLAN_RANK:Record<string,number>={free:0,basic:1,medium:2,pro:3};
export function planDirection(current:string,next:string){return (PLAN_RANK[next]??0)>(PLAN_RANK[current]??0)?'upgrade':'downgrade';}
export function canAddUsage(used:number,limit:number){return limit<0||used<limit;}
export function monthlyCreditDelta(allocated:number,entitled:number){return Math.max(0,entitled-allocated);}

export function verifiedPaidPeriod(invoice:{status:string|null;currency:string;livemode:boolean;customer:string|null;subscription:string|null},line:{currency:string;livemode:boolean;amount:number;quantity:number|null;subscription:string|null;start:number;end:number},identity:{customer:string;subscription:string}){
 if(invoice.status!=='paid'||invoice.currency!=='idr'||invoice.livemode||invoice.customer!==identity.customer||invoice.subscription!==identity.subscription)return null;
 if(line.currency!=='idr'||line.livemode||line.amount<0||line.quantity!==1||line.subscription!==identity.subscription||!Number.isFinite(line.start)||!Number.isFinite(line.end)||line.end<=line.start)return null;
 return {start:line.start,end:line.end};
}