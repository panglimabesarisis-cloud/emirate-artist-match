export type CsvColumn<T> = [header: string, value: (row: T) => unknown];

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  // Block spreadsheet formula injection from user-entered text.
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T>(rows: T[], cols: CsvColumn<T>[]): string {
  const lines = [cols.map(([h]) => cell(h)).join(",")];
  for (const r of rows) lines.push(cols.map(([, f]) => cell(f(r))).join(","));
  return lines.join("\r\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
