/** Illustrative phone story only: never read or change real chats, bookings or payments. */

export type ChatKind = "client" | "fan" | "agent" | "assistant";
export type Contact = { name: string; initials: string; kind: ChatKind; note: string };
export const CONTACTS: Record<string, Contact> = {
  sara: { name: "Sara · Wedding", initials: "SW", kind: "client", note: "online" },
  mike: { name: "Mike", initials: "MK", kind: "client", note: "online" },
  unknown: { name: "+971 55 000 0000", initials: "?", kind: "client", note: "online" },
  fan: { name: "Rami", initials: "RM", kind: "fan", note: "online" },
  omar: { name: "Omar · Company dinner", initials: "OM", kind: "client", note: "online" },
  events: { name: "Events Team", initials: "ET", kind: "client", note: "last seen today" },
  layla: { name: "Layla · Wedding", initials: "LW", kind: "client", note: "answered by Dealmaker Agent" },
  assistant: { name: "Dealmaker Agent", initials: "D", kind: "assistant", note: "your AI manager" },
};

export type Card = { kind: "form" | "invoice" | "calendar"; title: string; lines: string[]; action?: string };
export type Message = { mine: boolean; text: string; ai?: boolean; event?: boolean; card?: Card; choices?: string[]; picked?: number };
export type Overlay = { title: string; detail?: string; tone: "block" | "ask" | "later" | "trouble" | "agent" };
export type Step =
  | { kind: "chapter"; chapter: number }
  | { kind: "list" }
  | { kind: "incoming"; chat: string; text: string }
  | { kind: "open"; chat: string }
  | { kind: "say"; message: Message }
  | { kind: "pick"; choice: number }
  | { kind: "menu" }
  | { kind: "block" }
  | { kind: "overlay"; overlay: Overlay }
  | { kind: "invoice" }
  | { kind: "approve" };

export type PhoneState = {
  chapter: number; screen: "list" | "chat" | "invoice"; chat: string; order: string[];
  threads: Record<string, Message[]>; unread: Record<string, number>; blocked: string[]; menu: boolean; overlay: Overlay | null; approved: boolean;
};

export const CHAPTERS = ["Unread chats", "Fans", "Clash", "With Dealmaker"];
/** The first chapter in which the artist uses Dealmaker. */
export const AGENT_CHAPTER = 3;

const them = (text: string, extra: Partial<Message> = {}): Step => ({ kind: "say", message: { mine: false, text, ...extra } });
const me = (text: string, extra: Partial<Message> = {}): Step => ({ kind: "say", message: { mine: true, text, ...extra } });
const agent = (text: string, extra: Partial<Message> = {}): Step => me(text, { ai: true, ...extra });
const event = (text: string): Step => them(text, { event: true });
const show = (tone: Overlay["tone"], title: string, detail?: string): Step => ({ kind: "overlay", overlay: { tone, title, ...(detail ? { detail } : {}) } });
const open = (chat: string): Step => ({ kind: "open", chat });
const incoming = (chat: string, text: string): Step => ({ kind: "incoming", chat, text });
const list: Step = { kind: "list" };
const invoiceCard: Card = { kind: "invoice", title: "Invoice DM-1026", lines: ["DJ set · 3 hours + sound system", "AED 3,255.00 incl. VAT"], action: "Pay now" };

export const STORY: Step[] = [
  // 1. Unread chats: open, reply, go back, three times over.
  { kind: "chapter", chapter: 0 }, list,
  open("sara"), me("Hi Sara! My wedding sets start at AED 2,500."), list,
  incoming("events", "Hello?? Any update?"),
  open("mike"), me("Hi Mike, let me check Friday and tell you."), list,
  incoming("sara", "And for 4 hours? Discount?"),
  open("unknown"), me("Hi! Which date and venue, please?"), list,
  incoming("mike", "Still waiting…"), incoming("fan", "Hi!! 😍"),
  // 2. A fan who never books.
  { kind: "chapter", chapter: 1 },
  open("fan"), them("How are you? 😊"),
  me("I'm good, thank you! Sorry, who is this? Where are you from?"),
  them("I'm your biggest fan, from Sharjah! 😍"),
  me("Aww, thank you so much for your support 🙏"),
  them("Can we meet this weekend? Just coffee ☕"),
  me("That's kind of you. I'll let you know when I have a free slot."),
  them("Are you free today?"), them("Hello?? 🥺"), them("Why no reply?"), them("Send me a selfie!"),
  { kind: "menu" }, { kind: "block" },
  show("block", "BLOCKED"),
  show("ask", "How many chats like this do you get?"),
  // 3. A real job, handled by hand, ends in a clash.
  { kind: "chapter", chapter: 2 }, list,
  incoming("omar", "Hi, are you available for our company dinner on 18 December?"),
  open("omar"), me("Hi Omar! Yes. What time, and where?"),
  them("8 PM at a hotel in Dubai Marina, about 120 guests."),
  me("Great. How long should the set be?"),
  them("Two hours. Do you bring the sound system?"),
  me("Yes, sound is included. The price is AED 3,000."),
  them("Deal! Let's confirm."),
  me("Confirmed ✅ See you on the 18th."),
  show("later", "A few hours later…"),
  me("Omar, I'm so sorry. I'm already booked on the 18th. Can I refund you?"),
  them("No! We already told all our staff."),
  me("I can send your money back today."),
  them("I don't want a refund. You agreed! 😠"),
  show("trouble", "You are in trouble", "Schedule clash: two bookings on 18 December"),
  // 4. The same job with the Dealmaker agent.
  { kind: "chapter", chapter: AGENT_CHAPTER },
  show("agent", "Let's see how our agent works"),
  list, incoming("layla", "Hi! Can you perform at our wedding?"),
  open("layla"),
  agent("Hi Layla! I'm DJ Sami's Dealmaker Agent. What kind of job is it?", { choices: ["Wedding", "Corporate", "Birthday"] }),
  { kind: "pick", choice: 0 }, them("Wedding"),
  agent("Lovely! Please fill in this short form.", { card: { kind: "form", title: "Booking form", lines: ["Date · Time · Venue · Guests"], action: "Open form" } }),
  them("Form sent ✅ 12 December, 8 PM, Dubai Marina, 150 guests"),
  agent("The date is free. How long should the set be, and do you need a sound system?"),
  them("3 hours, with sound please."),
  agent("Perfect. I'm preparing your invoice…"),
  show("agent", "Agent confirms the invoice with the artist"),
  { kind: "invoice" }, { kind: "approve" },
  open("layla"),
  agent("Here is your invoice. You can pay from this link.", { card: invoiceCard }),
  them("Looks good. Paying now."), event("Payment started · AED 3,255.00"),
  show("agent", "AI agent confirms with the artist"),
  open("assistant"),
  them("New job 🎉 Wedding for Layla, 12 December, 8 PM, Dubai Marina. AED 3,255. Payment is in progress. Do you apply for this job?"),
  me("Yes, apply this job"),
  them("Done. I'll confirm it with the client."),
  open("layla"), event("Payment received · AED 3,255.00 ✅"),
  agent("Thank you Layla! Your booking is confirmed for 12 December."),
  them("Amazing, thank you! 🙌"),
  show("agent", "AI agent confirms to the artist"),
  open("assistant"),
  them("Layla has paid AED 3,255. The job is now in your schedule.", { card: { kind: "calendar", title: "12 December 2026", lines: ["8:00 PM · Wedding · Layla", "Dubai Marina"] } }),
  me("Perfect, thank you!"),
  show("agent", "Your AI manager, 24/7", "Answers, forms, invoices and your calendar"),
];

export const initialPhone = (): PhoneState => ({
  chapter: 0, screen: "list", chat: "sara", order: ["sara", "mike", "unknown", "events"], blocked: [], menu: false, overlay: null, approved: false,
  threads: {
    sara: [{ mine: false, text: "Hi, how much for a wedding?" }, { mine: false, text: "Hello?" }],
    mike: [{ mine: false, text: "Are you free this Friday?" }],
    unknown: [{ mine: false, text: "Price please?" }],
    events: [{ mine: false, text: "Can you send your rates?" }],
  },
  unread: { sara: 2, mike: 1, unknown: 4, events: 1 },
});

/** What the phone looks like after one more step. Overlays last only until the next step. */
export function applyStep(state: PhoneState, step: Step): PhoneState {
  const next: PhoneState = { ...state, overlay: null };
  switch (step.kind) {
    case "chapter": return { ...next, chapter: step.chapter };
    case "list": return { ...next, screen: "list", menu: false };
    case "incoming": return {
      ...next,
      threads: { ...state.threads, [step.chat]: [...(state.threads[step.chat] ?? []), { mine: false, text: step.text }] },
      unread: { ...state.unread, [step.chat]: (state.unread[step.chat] ?? 0) + 1 },
      order: [step.chat, ...state.order.filter((id) => id !== step.chat)],
    };
    case "open": return { ...next, screen: "chat", chat: step.chat, menu: false, unread: { ...state.unread, [step.chat]: 0 }, order: state.order.includes(step.chat) ? state.order : [step.chat, ...state.order] };
    case "say": return { ...next, threads: { ...state.threads, [state.chat]: [...(state.threads[state.chat] ?? []), step.message] } };
    case "pick": {
      const messages = [...(state.threads[state.chat] ?? [])];
      for (let i = messages.length - 1; i >= 0; i--) if (messages[i]!.choices) { messages[i] = { ...messages[i]!, picked: step.choice }; break; }
      return { ...next, threads: { ...state.threads, [state.chat]: messages } };
    }
    case "menu": return { ...next, menu: true };
    case "block": return { ...next, menu: false, blocked: [...state.blocked, state.chat] };
    case "overlay": return { ...next, overlay: step.overlay };
    case "invoice": return { ...next, screen: "invoice", approved: false };
    case "approve": return { ...next, approved: true };
  }
}

/** The phone as it stands just before step `index`, used to jump to a chapter. */
export const phoneAt = (index: number) => STORY.slice(0, index).reduce(applyStep, initialPhone());
export const chapterStart = (chapter: number) => Math.max(0, STORY.findIndex((step) => step.kind === "chapter" && step.chapter === chapter));
