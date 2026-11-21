import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { checkStripeTestCheckout, stripeConnectionMode } from '@/lib/stripe-settings.functions';

export function StripeConnectionCheck() {
  const readMode = useServerFn(stripeConnectionMode);
  const checkCheckout = useServerFn(checkStripeTestCheckout);
  const mode = useQuery({ queryKey: ['stripe-connected-mode'], queryFn: () => readMode(), retry: false });
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState('');
  const connectedMode = mode.data?.mode;
  async function check() {
    setChecking(true); setResult('');
    try {
      const response = await checkCheckout();
      if ('error' in response) setResult(response.error);
      else setResult(response.sessionExpired
        ? 'Verified: test checkout returned a client secret. Session expired; no payment submitted.'
        : 'Test checkout returned a client secret; session expiry could not be confirmed. No payment submitted.');
      await mode.refetch();
    } catch { setResult('Checkout check unavailable. Try again.'); }
    finally { setChecking(false); }
  }
  return (
    <section className="rounded-xl border bg-card p-5 space-y-4 max-w-3xl" aria-label="Stripe connection status">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">Connected Stripe credentials</h3>
        <Badge variant={connectedMode === 'live' ? 'destructive' : 'secondary'} aria-live="polite">
          {mode.isFetching ? 'Checking mode…' : connectedMode === 'test' ? 'Test mode · no real money' : connectedMode === 'live' ? 'Live mode · real money' : 'Mode unverified'}
        </Badge>
      </div>
      {(mode.error || (mode.data && 'error' in mode.data)) && <p role="alert" className="text-sm text-destructive">{mode.data && 'error' in mode.data ? mode.data.error : 'Unable to verify connected credentials.'}</p>}
      {connectedMode === 'live' && <p className="text-sm text-destructive">Live credentials connected. Test checkout is blocked.</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => { setResult(''); void mode.refetch(); }} disabled={mode.isFetching || checking}><RefreshCw className="size-4" /> Refresh mode</Button>
        <Button onClick={check} disabled={connectedMode !== 'test' || mode.isFetching || checking}><ShieldCheck className="size-4" />{checking ? 'Checking…' : 'Check test checkout'}</Button>
      </div>
      {result && <p role="status" className="text-sm text-muted-foreground">{result}</p>}
    </section>
  );
}