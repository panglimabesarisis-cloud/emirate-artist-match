import type Stripe from 'stripe';

export const hostedCheckoutSettings = {
  ui_mode: 'hosted_page',
  billing_address_collection: 'auto',
  phone_number_collection: { enabled: false },
  automatic_tax: { enabled: false },
  allow_promotion_codes: false,
  submit_type: 'auto',
  integration_identifier: 'hosted_web_0001',
  origin_context: 'web',
} as const satisfies Stripe.Checkout.SessionCreateParams;

export function checkoutUrl(session: { id: string; livemode: boolean; url: string | null }) {
  if (session.livemode !== false || !session.id.startsWith('cs_test_')) throw new Error('Live checkout is disabled.');
  if (!session.url) throw new Error('Stripe did not return a hosted checkout URL.');
  return validateHostedUrl(session.url);
}

export function validateHostedUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com' || url.username || url.password) {
    throw new Error('Invalid Stripe checkout URL.');
  }
  return value;
}

export function paymentReturnPath(value: string) {
  const base = 'https://dealmakertalent.com';
  const url = new URL(value, base);
  if (url.origin !== base || !value.startsWith('/') || value.startsWith('//') ||
      !/^\/(join\/payment|dashboard|booking\/[a-zA-Z0-9-]+|chat\/[a-zA-Z0-9-]+)$/.test(url.pathname)) {
    throw new Error('Invalid payment return destination.');
  }
  return url.pathname + url.search;
}

export function hostedReturnUrls(returnUrl: string, reference: { orderId: string } | { subscription: true }) {
  const destination = new URL(returnUrl);
  const returnTo = paymentReturnPath(destination.pathname + destination.search);
  const success = new URL('/checkout-return', destination.origin);
  success.searchParams.set('returnTo', returnTo);
  if ('orderId' in reference) success.searchParams.set('orderId', reference.orderId);
  else success.searchParams.set('subscription', 'true');
  success.searchParams.set('session_id', '{CHECKOUT_SESSION_ID}');
  return { success_url: success.href.replace('%7BCHECKOUT_SESSION_ID%7D', '{CHECKOUT_SESSION_ID}'), cancel_url: destination.href };
}