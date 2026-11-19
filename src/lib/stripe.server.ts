import Stripe from 'stripe';
const getEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not configured`);
  return value;
};
export type StripeEnv = 'sandbox' | 'live';
const GATEWAY_STRIPE_BASE = 'https://connector-gateway.lovable.dev/stripe';
export function getConnectionApiKey(env: StripeEnv): string {
  return env === 'sandbox' ? getEnv('STRIPE_SANDBOX_API_KEY') : getEnv('STRIPE_LIVE_API_KEY');
}
export function createStripeClient(env: StripeEnv): Stripe {
  const connectionApiKey = getConnectionApiKey(env);
  const lovableApiKey = getEnv('LOVABLE_API_KEY');
  return new Stripe(connectionApiKey, {
    apiVersion: '2026-03-25.dahlia',
    httpClient: Stripe.createFetchHttpClient((input, init) => {
      const stripeUrl = input instanceof Request ? input.url : input.toString();
      const gatewayUrl = stripeUrl.replace('https://api.stripe.com', GATEWAY_STRIPE_BASE);
      return fetch(gatewayUrl, {
        ...init,
        headers: {
          ...Object.fromEntries(new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined)).entries()),
          'X-Connection-Api-Key': connectionApiKey,
          'Lovable-API-Key': lovableApiKey,
        },
      });
    }),
  });
}
export function getStripeErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const stripeError = error as {message?: string; type?: string; code?: string; decline_code?: string; param?: string; requestId?: string; raw?: {message?: string; type?: string; code?: string; decline_code?: string; param?: string; requestId?: string}};
    const message = stripeError.raw?.message ?? stripeError.message;
    if (message) {
      const details = [stripeError.raw?.type ?? stripeError.type, stripeError.raw?.code ?? stripeError.code, stripeError.raw?.decline_code ?? stripeError.decline_code, stripeError.raw?.param ?? stripeError.param, stripeError.raw?.requestId ?? stripeError.requestId].filter(Boolean);
      return details.length ? `${message} (${details.join(', ')})` : message;
    }
  }
  return 'Stripe request failed';
}
export async function verifyWebhook(req: Request, env: StripeEnv) {
  const signature = req.headers.get('stripe-signature');
  const body = await req.text();
  const secret = getEnv(env === 'sandbox' ? 'PAYMENTS_SANDBOX_WEBHOOK_SECRET' : 'PAYMENTS_LIVE_WEBHOOK_SECRET');
  const parts = signature?.split(',') ?? [];
  const timestamp = parts.find(p => p.startsWith('t='))?.slice(2);
  if (!timestamp || !Number.isFinite(Number(timestamp)) || Math.abs(Date.now()/1000-Number(timestamp))>300) throw new Error('Invalid webhook timestamp');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${body}`));
  const expected = Array.from(new Uint8Array(signed), b=>b.toString(16).padStart(2,'0')).join('');
  const valid = parts.filter(p=>p.startsWith('v1=')).some(p=>{const actual=p.slice(3); if(actual.length!==expected.length)return false; let diff=0; for(let i=0;i<expected.length;i++)diff|=actual.charCodeAt(i)^expected.charCodeAt(i); return diff===0;});
  if(!valid)throw new Error('Invalid webhook signature');
  return JSON.parse(body) as { type: string; data: {object: {id:string}} };
}
