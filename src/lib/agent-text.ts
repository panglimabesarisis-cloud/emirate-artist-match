/** Answers are shown as formatted text in the app's own style: no HTML source, and sources as a table. */
const entities: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };
const HTML = /<\/?(h[1-6]|p|ul|ol|li|strong|b|em|i|div|span|table|thead|tbody|tr|td|th|br|hr|a|img|html|head|body|style|script|section|article|figure|header|footer)\b[^>]*>/i;
const inline = (html: string) => html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();

function convert(html: string) {
  return html
    .replace(/^[ \t]*\|.*$/gm, (row) => row.replace(/<br\s*\/?>/gi, " "))
    .replace(/<(script|style|head)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<!--[\s\S]*?-->|<!doctype[^>]*>/gi, "")
    .replace(/<table\b[^>]*>([\s\S]*?)<\/table>/gi, (_, body: string) => {
      const rows = [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) => [...r[1]!.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => inline(c[1]!.replace(/<a\b[^>]*href=["'](https?:[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)")).replace(/\|/g, "/"))).filter((r) => r.length);
      if (!rows.length) return "";
      const line = (cells: string[]) => `| ${cells.join(" | ")} |`;
      return `\n\n${[line(rows[0]!), line(rows[0]!.map(() => "---")), ...rows.slice(1).map(line)].join("\n")}\n\n`;
    })
    .replace(/<a\b[^>]*href=["'](https?:[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_, url: string, label: string) => `[${inline(label)}](${url})`)
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level: string, text: string) => `\n\n${"#".repeat(Math.min(4, Math.max(2, Number(level))))} ${inline(text)}\n\n`)
    .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, _t, text: string) => `**${text.trim()}**`)
    .replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_, _t, text: string) => `*${text.trim()}*`)
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<(br|hr)\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|ul|ol|section|article|header|footer|figure)>/gi, "\n\n")
    .replace(/<\/?[a-z][a-z0-9-]*(?:\s[^>]*)?\/?>/gi, "")
    .replace(/&(amp|lt|gt|quot|nbsp|#39);/g, (e) => entities[e] ?? e)
    .split("\n").map((l) => l.replace(/^[ \t]+/, "")).join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Turns HTML, fenced or loose, into plain formatted text. Other text is left as it is. */
export function htmlToMarkdown(text: string) {
  const unfenced = text.replace(/```(?:html|xml)?[ \t]*\n([\s\S]*?)(?:```|$)/gi, (block, body: string) => (HTML.test(body) ? `\n\n${convert(body)}\n\n` : block));
  return (HTML.test(unfenced) && !unfenced.includes("```") ? convert(unfenced) : unfenced).replace(/\n{3,}/g, "\n\n").trim();
}

export type TableSource = { title: string; url: string };
export const sourceTable = (sources: TableSource[]) => `| No | Source | Link |\n| --- | --- | --- |\n${sources.map((s, i) => `| ${i + 1} | ${s.title.replace(/\|/g, "/")} | [Open](${s.url}) |`).join("\n")}`;

/** A list of source links under a "Sources" or "Sumber" heading becomes a table. */
export function sourcesAsTable(text: string) {
  return text.replace(/^((?:#{1,6}[ \t]*|\*\*)?(?:sources?|sumber(?: referensi)?)[ \t]*:?(?:\*\*)?[ \t]*:?)[ \t]*\n+((?:[ \t]*(?:[-*]|\d+\.)[ \t]+\[[^\]\n]+\]\(https?:[^\s)]+\)[^\n]*(?:\n|$))+)/gim, (_, heading: string, list: string) => {
    const items = [...list.matchAll(/\[([^\]\n]+)\]\((https?:[^\s)]+)\)/g)].map((m) => ({ title: m[1]!, url: m[2]! }));
    return `${heading}\n\n${sourceTable(items)}\n`;
  });
}

export const tidyAnswer = (text: string) => sourcesAsTable(htmlToMarkdown(text));
