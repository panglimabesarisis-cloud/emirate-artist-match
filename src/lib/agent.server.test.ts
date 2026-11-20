import { beforeEach, describe, expect, it, vi } from 'vitest';
import { calendarWindow } from './calendar-rules';

const mocks = vi.hoisted(() => ({
  generate: vi.fn(), calendar: vi.fn(), notify: vi.fn(), contact: vi.fn(),
  writes: [] as { table: string; value: unknown }[],
  existing: false, sparseQuote: false,
}));

const flow = {
  artist_id: 'artist-fixture', enabled: true,
  nodes: [
    { id: 'start', type: 'start', data: { text: 'Hello' } },
    { id: 'buttons', type: 'buttons', data: { text: 'Proceed?', buttons: ['Book Now', 'Book Later'] } },
    { id: 'wa', type: 'whatsapp', data: { text: 'Send event details', destinationPhone: '0501234567' } },
  ],
  edges: [{ id: '1', source: 'start', target: 'buttons' }, { id: '2', source: 'buttons', sourceHandle: 'b0', target: 'wa' }],
};
function result(table: string, inserting: boolean) {
  const data: Record<string, unknown> = {
    conversations: { id: 'conversation-fixture', artist_id: 'artist-fixture', mode: 'ai', ai_replies: 2, quote_requests: mocks.sparseQuote ? { name: 'Maya' } : { name: 'Maya', email: 'maya@example.com', phone: '0501234567', guests: 1000 } },
    artists: { user_id: 'owner-fixture', stage_name: 'Dede', base_price: 5000 },
    agent_settings: { enabled: true }, credit_wallets: { balance: 100 }, rate_cards: [], ai_flows: [flow],
    messages: [
      { sender: 'client', body: 'Book Now' },
      { sender: 'ai', body: 'Proceed?\n[BUTTONS: Book Now | Book Later]' },
      { sender: 'client', body: 'Event Date: 2026-11-29\nEvent Start: 19:00\nEvent End: 21:00\nVenue: Dubai Chamber\nGuests: 1000\nJob Detail: Emcee' },
    ],
    bookings: inserting ? { id: 'booking-fixture', artist_key: 'fixture-key' } : mocks.existing ? { status: 'inquiry', artist_invoice_required: false, paid_amount: 0, total: 5250, cancelled_by: null } : null,
  };
  return { data: data[table] ?? null, error: null, count: mocks.existing ? 1 : 0 };
}

vi.mock('@/integrations/supabase/client.server', () => ({
  supabaseAdmin: {
    from: (table: string) => {
      let inserting = false;
      const chain = {
        select: () => chain, eq: () => chain, in: () => chain, or: () => chain, order: () => chain, limit: () => chain,
        insert: (value: unknown) => { inserting = true; mocks.writes.push({ table, value }); return chain; },
        update: (value: unknown) => { mocks.writes.push({ table, value }); return chain; },
        single: async () => result(table, inserting), maybeSingle: async () => result(table, inserting),
        then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result(table, inserting)).then(resolve),
      };
      return chain;
    },
  },
}));
vi.mock('@lovable.dev/ai-gateway', () => ({ generateResponse: mocks.generate, GatewayError: class extends Error {} }));
vi.mock('./calendar-availability.server', () => ({ checkGoogleAvailability: mocks.calendar }));
vi.mock('./notify.server', () => ({ notifyBooking: mocks.notify, artistContact: mocks.contact, siteOrigin: () => 'http://localhost:8080' }));
vi.mock('@tanstack/react-start/server', () => ({ getRequest: () => new Request('http://localhost:8080') }));

import { runAgent } from './agent.server';

beforeEach(() => {
  vi.clearAllMocks(); mocks.writes.length = 0; mocks.existing = false; mocks.sparseQuote = false;
  mocks.calendar.mockResolvedValue({ status: 'available', window: calendarWindow({ date: '2026-11-29', startTime: '19:00', endTime: '21:00' }) });
  mocks.contact.mockResolvedValue({ phone: '+971509999999', email: null });
  mocks.notify.mockResolvedValue(undefined);
  mocks.generate.mockResolvedValueOnce({ output: [{ type: 'function_call', name: 'check_calendar', call_id: 'cal-1', arguments: JSON.stringify({ date: '2026-11-29', startTime: '19:00', endTime: '21:00' }) }] })
    .mockResolvedValue({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Requesting artist approval.\n[BOOKING_READY {"title":"Emcee","amount":5000,"date":"2026-11-29","clientName":"Maya","notes":"Dubai Chamber, 19:00–21:00, 1000 guests","jobDetail":"Emcee"}]' }] }] });
});

describe('Book Now → artist WhatsApp dispatch', () => {
  it('creates an inquiry and dispatches once on the Book Now turn without another client answer', async () => {
    const details = {
      title: 'Emcee', amount: 5000, date: '2026-11-29', clientName: 'Maya', notes: 'Dubai Chamber, 19:00–21:00, 1000 guests', jobDetail: 'Emcee',
      organizing: 'Government UAE', clientOccupation: 'Government', venueName: 'Dubai Chamber', venueAddress: 'Dubai',
      eventType: 'Wedding Ceremony', indoorOutdoor: 'Indoor', performDuration: '60 minutes', wardrobe: 'Suit', dresscode: 'Formal',
      wardrobeRequest: 'Black suit', preEventMeeting: 'Online briefing', rehearsalDate: '2026-11-28', rehearsalStart: '17:00', rehearsalEnd: '18:00', rehearsalLocation: 'Dubai Chamber',
    };
    mocks.generate.mockResolvedValue({ output: [{ type: 'message', content: [{ type: 'output_text', text: `Requesting artist approval.\n[BOOKING_READY ${JSON.stringify(details)}]` }] }] });
    await runAgent('conversation-fixture');
    expect(mocks.calendar).toHaveBeenCalledWith('owner-fixture', { date: '2026-11-29', startTime: '19:00', endTime: '21:00' });
    expect(mocks.writes.find(write => write.table === 'bookings')?.value).toMatchObject({ status: 'inquiry', amount: 5000, total: 5250, start_time: '19:00', end_time: '21:00', artist_invoice_required: false });
    expect(mocks.notify).toHaveBeenCalledTimes(1);
    expect(mocks.notify).toHaveBeenCalledWith('booking-fixture', 'artist', 'approval_request', { phone: '+971501234567', email: null }, expect.any(String), expect.any(String), 'http://localhost:8080/approve/booking-fixture?k=fixture-key');
    expect(mocks.notify.mock.calls[0]?.[5]).toBe([
      'Dealmaker Management',
      '-----',
      'Payment: AED 5,000 + 5% VAT',
      'PIC: Maya',
      'Email: maya@example.com',
      'Phone: 0501234567',
      '-----',
      'Client: Government UAE',
      'Organization: Government',
      '-----',
      'Job Detail: Emcee',
      '-----',
      'Venue Name: Dubai Chamber',
      'Event Name: Wedding Ceremony',
      'Date Event: 29 November 2026',
      'Event Time: 19:00-21:00',
      'Event Type: Indoor',
      'Venue Address: Dubai',
      '-----',
      'Artist Perform Duration: 60 minutes',
      'Wardrobe: Suit',
      'DressCode: Formal',
      'Wardrobe request: Black suit',
      '-----',
      'Pre-Event Meeting: Online briefing',
      '-----',
      'Rehearsal Date: 2026-11-28',
      'Time Start: 17:00',
      'End Time: 18:00',
      'Location: Dubai Chamber',
    ].join('\n'));
  });
  it('drops lines whose value is empty instead of sending blank labels', async () => {
    mocks.sparseQuote = true;
    await runAgent('conversation-fixture');
    expect(mocks.notify).toHaveBeenCalledTimes(1);
    expect(mocks.notify.mock.calls[0]?.[5]).toBe([
      'Dealmaker Management',
      '-----',
      'Payment: AED 5,000 + 5% VAT',
      'PIC: Maya',
      '-----',
      'Job Detail: Emcee',
      '-----',
      'Date Event: 29 November 2026',
      'Event Time: 19:00-21:00',
    ].join('\n'));
  });
  it('never dispatches a busy slot', async () => {
    mocks.calendar.mockResolvedValue({ status: 'busy', window: calendarWindow({ date: '2026-11-29', startTime: '19:00', endTime: '21:00' }) });
    await runAgent('conversation-fixture');
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.writes.filter(write => write.table === 'bookings')).toHaveLength(0);
  });
  it('does not dispatch again when an inquiry already exists', async () => {
    mocks.existing = true;
    await runAgent('conversation-fixture');
    expect(mocks.notify).not.toHaveBeenCalled();
    expect(mocks.writes.filter(write => write.table === 'bookings')).toHaveLength(0);
  });
});