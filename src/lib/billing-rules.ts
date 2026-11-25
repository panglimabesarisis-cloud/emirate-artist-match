export const PLAN_LOOKUP_KEYS = {basic:{month:'basic_monthly',year:'basic_yearly'},medium:{month:'medium_monthly',year:'medium_yearly'},pro:{month:'pro_monthly',year:'pro_yearly'}} as const;
export type PaidPlan = keyof typeof PLAN_LOOKUP_KEYS;
export type BillingInterval='month'|'year';
/** The plan a Stripe price sells: by its current lookup key, or by the tag left on a replaced price. */
export function planOfPrice(price:{lookup_key?:string|null;metadata?:Record<string,string>|null}):PaidPlan|null{
 const named=(Object.keys(PLAN_LOOKUP_KEYS) as PaidPlan[]).find(code=>Object.values(PLAN_LOOKUP_KEYS[code]).some(key=>key===price.lookup_key));
 const tag=price.metadata?.['planCode'];
 return named??(tag==='basic'||tag==='medium'||tag==='pro'?tag:null);
}
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
}export const ITEM_KINDS=['agent_prompt','flow_template','order_form_template','contract_template'] as const;
export type ItemKind=typeof ITEM_KINDS[number];
export function itemAmountMinor(priceAed:number){if(!Number.isFinite(priceAed)||priceAed<=0)throw new Error('This item is free');return Math.round(priceAed*1.05*100);}
export function tierAllowed(plan:string,tier:string|null){return tier==null||(PLAN_RANK[plan]??0)>=(PLAN_RANK[tier]??99);}
