/** What the client told the AI agent, read back from the chat as question and answer pairs. */
export type ChatLine = { sender: string; body: string };
export type ChatAnswer = { label: string; value: string };

const HIDDEN = "[contact hidden]";
const PRIVATE = /\b(e-?mail|phone|whatsapp|mobile|contact number)\b/i;
const SMALL_TALK = /^(hi|hello|hey|halo|ok|okay|thanks?|thank you|correct|yes please)[\s!.]*$/i;

/** The question inside an agent message: its last sentence that asks something. */
function question(body: string) {
  const text = body.replace(/\[(?:BUTTONS|FORM|FORM_DATA):[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
  const asked = text.match(/[^.!?]*\?/g);
  return (asked?.at(-1) ?? "").replace(/^[\s,:-]+/, "").trim();
}

/** Filled form lines and single answers, newest value per question. Contact details are never included. */
export function chatAnswers(messages: ChatLine[]): ChatAnswer[] {
  const answers = new Map<string, ChatAnswer>();
  const add = (label: string, value: string) => {
    const name = label.replace(/[?:\s]+$/, "").trim(), text = value.trim();
    if (!name || !text || text.includes(HIDDEN) || PRIVATE.test(name)) return;
    answers.set(name.toLowerCase(), { label: name.slice(0, 120), value: text.slice(0, 600) });
  };
  let asked = "";
  for (const message of messages) {
    if (message.sender === "ai") { asked = question(message.body); continue; }
    if (message.sender !== "client") continue;
    const text = message.body.split("\n[")[0]!.trim();
    // A filled form arrives as "Label: value" lines.
    const lines = text.split("\n").map(line => /^([^:]{2,80}?)\s*:\s*(.+)$/.exec(line.trim()));
    if (lines.length && lines.every(Boolean)) lines.forEach(line => add(line![1]!, line![2]!));
    else if (asked && text.length <= 600 && !SMALL_TALK.test(text)) add(asked, text);
    asked = "";
  }
  return [...answers.values()];
}
