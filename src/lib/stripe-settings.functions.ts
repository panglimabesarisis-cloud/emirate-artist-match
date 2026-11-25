import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export const stripeConnectionMode = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: admin, error } = await context.supabase.rpc('admin_can', { _module: 'settings', _action: 'read' });
    if (error || !admin) throw new Error('Forbidden');
    const { readStripeMode, stripeCheckError } = await import('./stripe-check.server');
    try { return await readStripeMode(); } catch (error) { return stripeCheckError(error); }
  });

export const checkStripeTestCheckout = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: admin, error } = await context.supabase.rpc('admin_can', { _module: 'settings', _action: 'edit' });
    if (error || !admin) throw new Error('Forbidden');
    const { runStripeCheckoutCheck, stripeCheckError } = await import('./stripe-check.server');
    try { return await runStripeCheckoutCheck(); } catch (error) { return stripeCheckError(error); }
  });