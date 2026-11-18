import { describe, it, expect } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(toCsv([{ a: 'x, "y"\nz' }], [["A", (r) => r.a]])).toBe('A\r\n"x, ""y""\nz"');
  });
  it("neutralises formula injection but keeps negative numbers", () => {
    expect(toCsv([{ a: "=HYPERLINK(1)" }, { a: -50 }], [["A", (r) => r.a]])).toBe("A\r\n'=HYPERLINK(1)\r\n-50");
  });
  it("empty for null", () => {
    expect(toCsv([{ a: null }], [["A", (r) => r.a]])).toBe("A\r\n");
  });
});
