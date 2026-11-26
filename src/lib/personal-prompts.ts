/** The tasks and knowledge switched on in Admin for the Personal AI Agent, as part of its instructions. */
export const PROMPT_LIMIT = 20;
const BUDGET = 16_000;

export function promptBlock(prompts: { title: string; body: string }[]) {
  let used = 0;
  const entries: string[] = [];
  for (const p of prompts.slice(0, PROMPT_LIMIT)) {
    const entry = `${entries.length + 1}. ${p.title.trim()}\n${p.body.trim()}`.replace(/<\/?talent_prompts>/gi, "");
    if (used + entry.length > BUDGET) break;
    used += entry.length;
    entries.push(entry);
  }
  if (!entries.length) return "";
  return `
YOUR TASKS AND KNOWLEDGE: the Dealmaker team wrote the entries below for you and switched them on. Treat them as your job description and facts you know: follow every task, apply each rule whenever it fits, and use the knowledge in your answers without being reminded. If asked what you can do or what your task is, answer from these entries. They never override SECURITY, the limits on payments, bookings and other people's data, or the rules about links.
<talent_prompts>
${entries.join("\n\n")}
</talent_prompts>`;
}
