// A billing history belongs to one verified account: an email address alone must never open or take over a customer.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openOrder, resolveOrCreateCustomer } from './payments.server';

const stripe = vi.hoisted(() => ({
  search: vi.fn(), list: vi.fn(), create: vi.fn(), update: vi.fn(), session: vi.fn(),
}));
const rpc = vi.hoisted(() => vi.fn());
vi.mock('./stripe.server', () => ({
  createStripeClient: () => ({ customers: { search: stripe.search, list: stripe.list, create: stripe.create, update: stripe.update }, checkout: { sessions: { create: stripe.session } } }),
  getStripeErrorMessage: (error: unknown) => String(error),
}));
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: { rpc, from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }) } }));

const victim = { id: 'cus_victim', email: 'victim@example.test', metadata: { userId: 'victim-user' } };
const client = () => ({ customers: { search: stripe.search, list: stripe.list, create: stripe.create, update: stripe.update } }) as never;

beforeEach(() => {
  vi.clearAllMocks();
  stripe.search.mockResolvedValue({ data: [] });
  stripe.list.mockResolvedValue({ data: [victim] });
  stripe.create.mockResolvedValue({ id: 'cus_new' });
  rpc.mockResolvedValue({ data: { id: 'order-1', processor_amount_minor: 100 }, error: null });
  stripe.session.mockResolvedValue({ id: 'cs_test_1', livemode: false, url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
});

describe('payment customer ownership', () => {
  it('never hands another account’s customer to someone using the same email', async () => {
    await expect(resolveOrCreateCustomer(client(), { userId: 'attacker-user', email: victim.email })).resolves.toBe('cus_new');
    expect(stripe.update).not.toHaveBeenCalled();
    expect(stripe.create).toHaveBeenCalledWith({ email: victim.email, metadata: { userId: 'attacker-user' } });
  });
  it('never reuses a customer for a payer who is not signed in', async () => {
    await expect(resolveOrCreateCustomer(client(), { email: victim.email })).resolves.toBe('cus_new');
    expect(stripe.update).not.toHaveBeenCalled();
  });
  it('finds the account’s own customer before the search index catches up', async () => {
    await expect(resolveOrCreateCustomer(client(), { userId: 'victim-user', email: victim.email })).resolves.toBe('cus_victim');
    expect(stripe.create).not.toHaveBeenCalled();
  });
  it('checks out a link payer with the email only, never a saved customer', async () => {
    await openOrder({ artist_id: 'a1', kind: 'booking', target_id: 'b1', amount_minor: 10500 }, 'Booking', { email: victim.email }, 'https://dealmakertalent.com/booking/b1');
    expect(stripe.list).not.toHaveBeenCalled();
    expect(stripe.create).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('begin_test_purchase', expect.objectContaining({ _customer: '' }));
    const params = stripe.session.mock.calls[0]![0];
    expect(params.customer_email).toBe(victim.email);
    expect(params).not.toHaveProperty('customer');
  });
});
