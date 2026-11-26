/** Exact arithmetic for the agent: its own small parser, so no text is ever executed. */
export const CALC_TOOL = {
  type: "function" as const,
  strict: true,
  name: "calculate",
  description: "Work out an arithmetic expression exactly. Use it for every sum, total, percentage, VAT, discount, split or unit conversion. Operators + - * / ^, postfix % for percent, mod, parentheses, sqrt, abs, round, floor, ceil, min, max, log, ln, pi, e. Write numbers without thousands separators.",
  parameters: { type: "object", properties: { expression: { type: "string" } }, required: ["expression"], additionalProperties: false },
};

const FUNCTIONS: Record<string, (...v: number[]) => number> = { sqrt: Math.sqrt, abs: Math.abs, round: (v, d = 0) => Math.round(v * 10 ** d) / 10 ** d, floor: Math.floor, ceil: Math.ceil, min: Math.min, max: Math.max, log: Math.log10, ln: Math.log };
const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

export function calculate(expression: string): number {
  if (expression.length > 400) throw new Error("The calculation is too long");
  const tokens = expression.toLowerCase().replace(/×/g, "*").replace(/÷/g, "/").match(/\d+(?:\.\d+)?|\.\d+|[a-z]+|\S/g) ?? [];
  let at = 0, depth = 0;
  const peek = () => tokens[at];
  const take = (wanted?: string) => { const token = tokens[at++]; if (wanted && token !== wanted) throw new Error(`Expected ${wanted}`); return token; };
  const sum = (): number => { let v = product(); while (peek() === "+" || peek() === "-") v = take() === "+" ? v + product() : v - product(); return v; };
  const product = (): number => {
    let v = signed();
    while (["*", "/", "mod"].includes(peek() ?? "")) { const op = take(); const next = signed(); v = op === "*" ? v * next : op === "/" ? v / next : v % next; }
    return v;
  };
  const signed = (): number => (peek() === "-" ? (take(), -signed()) : peek() === "+" ? (take(), signed()) : power());
  const power = (): number => { const base = percent(); return peek() === "^" ? (take(), base ** signed()) : base; };
  const percent = (): number => { let v = atom(); while (peek() === "%") { take(); v /= 100; } return v; };
  const atom = (): number => {
    if (++depth > 60) throw new Error("The calculation is nested too deeply");
    const token = take();
    let value: number;
    if (token === "(") { value = sum(); take(")"); }
    else if (token && /^\.?\d/.test(token)) value = Number(token);
    else if (token && Object.hasOwn(CONSTANTS, token)) value = CONSTANTS[token]!;
    else if (token && Object.hasOwn(FUNCTIONS, token)) {
      take("(");
      const args = [sum()];
      while (peek() === ",") { take(); args.push(sum()); }
      take(")");
      value = FUNCTIONS[token]!(...args);
    } else throw new Error(token ? `Unknown part: ${token}` : "The calculation is incomplete");
    depth--;
    return value;
  };
  const result = sum();
  if (at !== tokens.length) throw new Error(`Unknown part: ${tokens[at]}`);
  if (!Number.isFinite(result)) throw new Error("The result is not a number");
  // Removes binary noise such as 0.1 + 0.2.
  return Number(result.toPrecision(12));
}
