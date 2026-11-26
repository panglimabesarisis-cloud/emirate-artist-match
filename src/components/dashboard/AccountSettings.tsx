import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Lock, LogOut, Pencil, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PayoutBankCard } from './PayoutBankCard';
import { useOtpGate } from '@/components/shared/OtpGate';
import { useI18n } from '@/lib/i18n';
import { StudioHeading } from './StudioPage';
import './agent-account.css';

type AccountModal = 'name' | 'email' | 'password' | 'closure' | null;
export function AccountSettings() {
  const { t } = useI18n();
  const [userId, setUserId] = useState('');
  const [currentEmail, setCurrentEmail] = useState('');
  const [name, setName] = useState('');
  const [savedName, setSavedName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [closed, setClosed] = useState(false);
  const [modal, setModal] = useState<AccountModal>(null);
  const [loadError, setLoadError] = useState('');
  const gate = useOtpGate();
  useEffect(() => { void supabase.auth.getUser().then(async ({ data, error }) => {
    if (error) { setLoadError(error.message); return; }
    if (!data.user) return;
    setUserId(data.user.id); setCurrentEmail(data.user.email ?? ''); setEmail(data.user.email ?? '');
    const [profile, closure] = await Promise.all([supabase.from('profiles').select('display_name').eq('id', data.user.id).single(), supabase.from('account_closure_requests').select('status').eq('user_id', data.user.id).maybeSingle()]);
    if (profile.error || closure.error) setLoadError(profile.error?.message ?? closure.error?.message ?? '');
    setName(profile.data?.display_name ?? ''); setSavedName(profile.data?.display_name ?? ''); setClosed(!!closure.data);
  }); }, []);
  const verification = useQuery({ queryKey: ['account-verification', userId], enabled: !!userId, queryFn: async () => {
    const artist = await supabase.rpc('private_artists').select('id').eq('user_id', userId).maybeSingle();
    if (artist.error) throw artist.error;
    if (!artist.data) return null;
    const result = await supabase.from('verification_applications').select('status, created_at').eq('artist_id', artist.data.id).eq('badge_type', 'verified_identity').order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (result.error) throw result.error;
    return { artistId: artist.data.id, application: result.data };
  } });
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } catch (error) { toast.error(error instanceof Error ? error.message : t('Update failed')); } finally { setBusy(false); } };
  const reauthenticate = async () => {
    if (!currentPassword) throw new Error(t('Enter your current password to change sign-in details. For social sign-in, use password recovery first.'));
    const { error } = await supabase.auth.signInWithPassword({ email: currentEmail, password: currentPassword }); if (error) throw error;
  };
  const closeModal = () => { setModal(null); setCurrentPassword(''); setPassword(''); };
  // A talent enters a WhatsApp code before any account change.
  const openModal = (next: AccountModal) => void gate.run('talent', () => { setName(savedName); setEmail(currentEmail); setCurrentPassword(''); setPassword(''); setModal(next); });
  const submit = () => gate.run('talent', () => void apply());
  const apply = () => run(async () => {
    if (!userId) return;
    if (modal === 'name') {
      if (!name.trim()) throw new Error(t('Enter your name'));
      const { error } = await supabase.from('profiles').update({ display_name: name.trim() }).eq('id', userId); if (error) throw error;
      setSavedName(name.trim()); toast.success(t('Account name saved'));
    } else if (modal === 'email') {
      await reauthenticate(); const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: window.location.origin + '/account' }); if (error) throw error;
      toast.success(t('Check your old and new email for confirmation. Your current email stays active until confirmed.'));
    } else if (modal === 'password') {
      if (password.length < 8) throw new Error(t('Use at least 8 characters'));
      await reauthenticate(); const { error } = await supabase.auth.updateUser({ password }); if (error) throw error;
      toast.success(t('Password updated'));
    } else if (modal === 'closure') {
      const { error } = await supabase.from('account_closure_requests').insert({ user_id: userId }); if (error) throw error;
      setClosed(true); toast.success(t('Closure request recorded for review'));
    }
    closeModal();
  });
  const status = verification.data?.application?.status;
  const statusLabel = verification.isPending ? 'Loading…' : status === 'approved' ? 'Verified' : status === 'submitted' || status === 'pending' ? 'Under review' : status === 'needs_more_info' ? 'More information needed' : status === 'rejected' ? 'Rejected' : 'Not verified';
  const titles = { name: 'Edit account name', email: 'Change email', password: 'Change password', closure: 'Request account closure' };
  return <div className="studio-account-main">
    <StudioHeading title="Account" accent="settings" />
    <div className="studio-account-stack">
      {loadError && <p role="alert" className="text-destructive">{loadError}</p>}
      <PayoutBankCard userId={userId} />
      <section className="studio-account-section"><div className="account-section-head"><h2>{t('Account')} <span className="it">{t('details')}</span></h2><Button variant="outline" disabled={!userId || busy} onClick={() => openModal('name')}><Pencil className="size-4" />{t('Edit')}</Button></div><dl className="account-record"><div><dt>{t('Name')}</dt><dd>{savedName || '—'}</dd></div><div><dt>{t('Current email')}</dt><dd dir="ltr">{currentEmail || '—'}</dd></div></dl></section>
      <section className="studio-account-section"><div className="account-section-head"><h2>{t('Sign-in')} <span className="it">{t('details')}</span></h2><Lock className="size-5 text-gold" /></div><dl className="account-record"><div><dt>{t('Email')}</dt><dd><Button variant="outline" disabled={!userId || busy} onClick={() => openModal('email')}>{t('Change email')}</Button></dd></div><div><dt>{t('Password')}</dt><dd><Button variant="outline" disabled={!userId || busy} onClick={() => openModal('password')}>{t('Change password')}</Button></dd></div></dl></section>
      <section className="studio-account-section"><div className="account-section-head"><h2>{t('Account')} <span className="it">{t('closure')}</span></h2></div><p className="text-sm text-muted-foreground">{t('Closure requests are reviewed before any data is removed. Existing bookings and financial records are retained.')}</p><div className="agent-save"><Button variant="outline" disabled={!userId || busy || closed} onClick={() => openModal('closure')}>{t(closed ? 'Closure requested' : 'Request account closure')}</Button><Button variant="ghost" disabled={busy} onClick={() => run(async () => { const { error } = await supabase.auth.signOut(); if (error) throw error; window.location.assign('/auth'); })}><LogOut className="size-4" />{t('Sign out')}</Button></div></section>
    </div>
    <aside className="studio-account-stack">
      <section className="studio-account-section"><div className="account-section-head"><h2>{t('Identity')} <span className="it">{t('verification')}</span></h2><ShieldCheck className="size-5 text-gold" /></div>{verification.error ? <p role="alert" className="text-destructive">{verification.error.message}</p> : <span className="account-status">{t(statusLabel)}</span>}<ol className="account-steps"><li><b>{t('WhatsApp OTP')}</b>{t('Confirm your phone number.')}</li><li><b>{t('Your details')}</b>{t('Your identity document and personal details.')}</li><li><b>{t('3 selfies')}</b>{t('Front, right and left.')}</li><li><b>{t('Review')}</b>{t('Your application is reviewed before a decision.')}</li></ol><Button asChild variant="outline"><Link to="/dashboard">{t('Back to dashboard')}</Link></Button></section>
      <section className="studio-account-section"><div className="account-section-head"><h2>{t('Why it is')} <span className="it">{t('locked')}</span></h2></div><ol className="account-steps"><li><b>{t('One place to edit')}</b>{t('The Wallet shows your bank details read-only.')}</li><li><b>{t('3 day pause')}</b>{t('Withdrawals open 3 days after your bank details change.')}</li><li><b>{t('WhatsApp code')}</b>{t('Every change needs a code sent to your number, and you are told when your bank account changes.')}</li></ol></section>
      <section className="studio-account-section"><div className="account-section-head"><h2>{t('Account')} <span className="it">{t('record')}</span></h2></div><dl className="account-record"><div><dt>{t('Current email')}</dt><dd dir="ltr">{currentEmail || '—'}</dd></div><div><dt>{t('Account name')}</dt><dd>{savedName || '—'}</dd></div></dl></section>
    </aside>
    {gate.dialog}
    <Dialog open={modal !== null} onOpenChange={open => { if (!open && !busy) closeModal(); }}><DialogContent className="account-modal"><DialogHeader><span className="studio-empty-icon"><Lock className="size-6" /></span><DialogTitle>{modal ? t(titles[modal]) : ''}</DialogTitle><DialogDescription>{t(modal === 'closure' ? 'Closure requests are reviewed before any data is removed. Existing bookings and financial records are retained.' : modal === 'name' ? 'Account details' : 'Confirm your current password before changing sign-in details.')}</DialogDescription></DialogHeader><form onSubmit={event => { event.preventDefault(); void submit(); }} className="space-y-4">
      {modal === 'name' && <div><Label htmlFor="account-name">{t('Name')}</Label><Input id="account-name" required value={name} maxLength={100} onChange={event => setName(event.target.value)} /></div>}
      {(modal === 'email' || modal === 'password') && <div><Label htmlFor="current-password">{t('Current password')}</Label><Input id="current-password" required type="password" autoComplete="current-password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} /></div>}
      {modal === 'email' && <div><Label htmlFor="account-email">{t('New email')}</Label><Input id="account-email" required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} /></div>}
      {modal === 'password' && <div><Label htmlFor="new-password">{t('New password')}</Label><Input id="new-password" required type="password" autoComplete="new-password" minLength={8} value={password} onChange={event => setPassword(event.target.value)} /></div>}
      <DialogFooter className="account-modal-footer"><Button type="button" variant="outline" disabled={busy} onClick={closeModal}>{t('Cancel')}</Button><Button type="submit" disabled={busy || !userId}>{t(busy ? 'Saving…' : modal === 'closure' ? 'Request account closure' : 'Save changes')}</Button></DialogFooter>
    </form></DialogContent></Dialog>
  </div>;
}
