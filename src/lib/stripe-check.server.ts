import { createStripeClient, getStripeErrorMessage } from './stripe.server';
import { joinPaymentTotal } from './join-rules';
import { testProcessorAmount } from './processor-rules';

type CheckClient = Pick<ReturnType<typeof createStripeClient>, 'balance' | 'checkout'>;

export async function readStripeMode(client: CheckClient = createStripeClient('sandbox')) {
  const balance = await client.balance.retrieve();
  if (balance.livemode === false) return { mode: 'test' as const };
  if (balance.livemode === true) return { mode: 'live' as const };
  throw new Error('Stripe credential mode could not be verified. Checkout check blocked.');
}

export async function runStripeCheckoutCheck(client: CheckClient = createStripeClient('sandbox')) {
  const { mode } = await readStripeMode(client);
  if (mode !== 'test') throw new Error('Live-mode credentials detected. Checkout check blocked; connect test-mode credentials.');

  // Match the existing sandbox checkout, but never create an order, customer,
  // entitlement, or payment confirmation. Stripe balance is a read-only preflight.
  const session = await client.checkout.sessions.create({
    mode: 'payment', ui_mode: 'embedded_page', redirect_on_completion: 'never',
    line_items: [{ price_data: {
      currency: 'idr',
      unit_amount: testProcessorAmount(Math.round(joinPaymentTotal().total * 100)),
      product_data: { name: 'Dealmaker test checkout check (no payment)' },
      tax_behavior: 'inclusive',
    }, quantity: 1 }],
    metadata: { purpose: 'test_checkout_check' },
  });
  let sessionExpired = false;
  try {
    if (session.livemode !== false || !session.id.startsWith('cs_test_')) {
      throw new Error('Stripe did not return a verified test-mode session.');
    }
    if (!session.client_secret) throw new Error('Stripe did not return a client secret.');
  } finally {
    // Return no client secret: the check must not open a payable checkout.
    if (session.id && session.status === 'open') {
      try { await client.checkout.sessions.expire(session.id); sessionExpired = true; }
      catch { /* Report incomplete cleanup without exposing provider details. */ }
    }
  }
  return { mode: 'test' as const, clientSecretReturned: true, sessionExpired };
}

export function stripeCheckError(error: unknown) {
  return { mode: 'unknown' as const, error: getStripeErrorMessage(error) };
}