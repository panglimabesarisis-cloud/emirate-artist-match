/** Illustrative booking told through the agent inbox. No real people, messages or payments. */

export type ChatStatus = "inquiry" | "pending" | "paid";
export const STATUS_LABEL: Record<ChatStatus, string> = { inquiry: "Inquiry", pending: "Pending", paid: "Paid" };
export type ThreadId = "client" | "artist";
export type ButtonId = "open-invoice" | "stripe" | "calendar";
export type Card = { title: string; rows?: [string, string][]; blank?: string[]; paid?: boolean; button?: { id: ButtonId; label: string } };
export type ChatMessage = { from: "client" | "artist" | "ai"; text?: string; card?: Card; choices?: string[]; picked?: number };
export type EditorField = "price" | "extra" | "extraPrice";
/** The invoice page the artist is redirected to. */
export type InvoicePage = Record<EditorField, string> & { editing: boolean; saved: boolean };
export type AgentStep =
  | { kind: "say"; thread: ThreadId; message: ChatMessage; status?: ChatStatus }
  | { kind: "switch"; thread: ThreadId }
  | { kind: "press"; button: ButtonId }
  | { kind: "pick"; choice: number }
  | { kind: "edit" }
  | { kind: "fill"; field: EditorField; value: string }
  | { kind: "save" }
  | { kind: "send" };

export type AgentState = {
  thread: ThreadId; chats: Record<ThreadId, ChatMessage[]>; status: ChatStatus; pressed: ButtonId[];
  page: InvoicePage | null; unread: number;
};

const say = (thread: ThreadId, from: ChatMessage["from"], rest: Omit<ChatMessage, "from">, status?: ChatStatus): AgentStep =>
  ({ kind: "say", thread, message: { from, ...rest }, ...(status ? { status } : {}) });
const event: [string, string][] = [["Event", "Wedding"], ["Date", "Sat 12 December 2026"], ["Time", "8:00 PM – 11:00 PM"], ["Location", "Hotel ballroom, Dubai Marina"]];

export const AGENT_STORY: AgentStep[] = [
  say("client", "client", { text: "Hi! I'd like to book DJ Sami." }, "inquiry"),
  say("client", "ai", { text: "Great to hear from you! Please fill in your contact details.", card: { title: "Your details", blank: ["Name", "Email", "WhatsApp"] } }),
  say("client", "client", { card: { title: "Your details", rows: [["Name", "Aisha Rahman"], ["Email", "aisha@example.com"], ["WhatsApp", "+971 50 000 0000"]] } }),
  say("client", "ai", { text: "Thanks for the information! Now tell me about your event.", card: { title: "Event details", blank: ["Event", "Date", "Time", "Location"] } }),
  say("client", "client", { card: { title: "Event details", rows: event } }),
  say("client", "ai", { text: "Thank you. I'm checking with the artist now." }),
  { kind: "switch", thread: "artist" },
  say("artist", "ai", { text: "New enquiry from Aisha Rahman.", card: { title: "Event details", rows: event } }),
  say("artist", "ai", { text: "Here is the draft invoice. Open it to check your price.", card: { title: "Invoice DM-1024", rows: [["Link", "dealmakertalent.com/invoice/DM-1024"]], button: { id: "open-invoice", label: "Open invoice" } } }),
  { kind: "press", button: "open-invoice" },
  { kind: "edit" },
  { kind: "fill", field: "price", value: "2500" },
  { kind: "fill", field: "extra", value: "Sound system and 2 microphones" },
  { kind: "fill", field: "extraPrice", value: "600" },
  { kind: "save" },
  { kind: "send" },
  say("artist", "ai", { text: "Done. I'm sending your invoice to the client." }),
  { kind: "switch", thread: "client" },
  say("client", "ai", {
    text: "Good news! DJ Sami is available on Saturday 12 December. If you want to book, here is your invoice.",
    card: { title: "Invoice DM-1024", rows: [["DJ set · 3 hours", "AED 2,500.00"], ["Sound system and 2 microphones", "AED 600.00"], ["VAT 5%", "AED 155.00"], ["Total", "AED 3,255.00"]] },
    choices: ["Book", "Cancel"],
  }, "pending"),
  { kind: "pick", choice: 0 },
  say("client", "client", { text: "Book" }),
  say("client", "ai", { text: "Wonderful! Here is your invoice link with secure payment.", card: { title: "Invoice DM-1024", rows: [["Amount", "AED 3,255.00"], ["Link", "dealmakertalent.com/pay/DM-1024"]], button: { id: "stripe", label: "Pay with Stripe" } } }),
  say("client", "client", { text: "Wait, I will pay it." }),
  say("client", "ai", { text: "I'm waiting." }),
  { kind: "press", button: "stripe" },
  say("client", "client", { card: { title: "Invoice DM-1024", paid: true, rows: [["Amount paid", "AED 3,255.00"], ["Paid with", "Card · Stripe"]] } }, "paid"),
  say("client", "ai", { text: "Payment received. Thank you, Aisha! Your booking is confirmed." }),
  { kind: "switch", thread: "artist" },
  say("artist", "ai", {
    text: "The job is a deal! Aisha has paid.",
    card: { title: "Wedding · Aisha Rahman", paid: true, rows: [["Date", "Sat 12 December"], ["Time", "8:00 PM – 11:00 PM"], ["Location", "Dubai Marina"], ["Invoice", "DM-1024 · AED 3,255.00"]], button: { id: "calendar", label: "Check calendar" } },
  }),
  { kind: "press", button: "calendar" },
];

export const initialAgent = (): AgentState => ({ thread: "client", chats: { client: [], artist: [] }, status: "inquiry", pressed: [], page: null, unread: 0 });

export function applyAgent(state: AgentState, step: AgentStep): AgentState {
  switch (step.kind) {
    case "say": return {
      ...state, status: step.status ?? state.status,
      chats: { ...state.chats, [step.thread]: [...state.chats[step.thread], step.message] },
      unread: step.thread === "artist" && state.thread !== "artist" ? state.unread + 1 : state.unread,
    };
    case "switch": return { ...state, thread: step.thread, page: null, unread: step.thread === "artist" ? 0 : state.unread };
    // The draft starts from the rate card; the artist may change it before it is sent.
    case "press": return { ...state, pressed: [...state.pressed, step.button], page: step.button === "open-invoice" ? { price: "2000", extra: "", extraPrice: "", editing: false, saved: false } : state.page };
    case "edit": return state.page ? { ...state, page: { ...state.page, editing: true, saved: false } } : state;
    case "pick": {
      const messages = [...state.chats[state.thread]];
      for (let i = messages.length - 1; i >= 0; i--) if (messages[i]!.choices) { messages[i] = { ...messages[i]!, picked: step.choice }; break; }
      return { ...state, chats: { ...state.chats, [state.thread]: messages } };
    }
    case "fill": return state.page?.editing ? { ...state, page: { ...state.page, [step.field]: step.value } } : state;
    case "save": return state.page ? { ...state, page: { ...state.page, editing: false, saved: true } } : state;
    case "send": return { ...state, page: null };
  }
}
