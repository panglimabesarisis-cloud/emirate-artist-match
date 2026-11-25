// Guards for the security scan findings that live in server code.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validateAttachment } from './chat-attachments';
import { MASK, maskContacts } from './masking';

const source = (file: string) => readFileSync(file, 'utf8');

describe('crafted chat input', () => {
  it('masks hostile text quickly', () => {
    const long = 200_000;
    const started = Date.now();
    for (const text of ['a'.repeat(long), `a@${'a.'.repeat(long / 2)}`, '0'.repeat(long), '1 '.repeat(long / 2), `1${' '.repeat(long)}x`]) maskContacts(text);
    expect(Date.now() - started).toBeLessThan(2000);
  });
  it('still hides contact details', () => {
    expect(maskContacts('mail me: jane.doe+gigs@mail.example.co.uk or +971 50 123 4567')).toBe(`mail me: ${MASK} or ${MASK}`);
    expect(maskContacts(`${'x'.repeat(80)}@example.com`)).not.toContain('example.com');
  });
  it('shortens a huge file name before reading it', () => {
    const started = Date.now();
    expect(validateAttachment({ name: `${'a'.repeat(500_000)}.pdf`, type: 'application/pdf', size: 10 }).name.length).toBeLessThanOrEqual(120);
    expect(Date.now() - started).toBeLessThan(500);
  });
});

describe('server access', () => {
  it('signs team chat files for two minutes at most', () => {
    const ttl = source('src/lib/chat-files.functions.ts').match(/createSignedUrl\(file\.path, (\w+)\)/)?.[1];
    const value = /^\d+$/.test(ttl ?? '') ? Number(ttl) : Number(source('src/lib/chat-files.functions.ts').match(new RegExp(`${ttl} = (\\d+)`))?.[1]);
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThanOrEqual(120);
  });
  it('sends the WhatsApp test only to the admin’s own verified number', () => {
    const code = source('src/lib/whatsapp-settings.functions.ts');
    expect(code).toContain('phone_verified_at');
    expect(code.slice(code.indexOf('testWhatsAppSettings'))).not.toContain('data.phone');
  });
  it('keeps rate card names off the public profile', () => {
    expect(source('src/lib/public.functions.ts')).not.toMatch(/from\("rate_cards"\)\.select\("[^"]*title/);
    expect(source('src/lib/chat.functions.ts')).not.toContain('packageIds');
    expect(source('src/lib/chat.functions.ts')).not.toMatch(/from\("rate_cards"\)\.select\("title/);
  });
  it('never attaches a saved customer to a link checkout', () => {
    expect(source('src/lib/payments.functions.ts')).not.toContain('userId:c.quote_requests?.client_user_id');
    expect(source('src/lib/bookings.functions.ts')).not.toContain('userId: identity?.client_user_id');
  });
});
