import { describe, expect, it } from "vitest";
import { bankProblem, cleanBank, codeDestination, maskPhone, mayAttachPhone, type PhoneState } from "./account-otp-rules";

const mine = "+971501234567", theirs = "+971509999999";
const state = (patch: Partial<PhoneState> = {}): PhoneState => ({ talent: true, verified: null, listed: null, granted: false, ...patch });

describe("account code rules", () => {
  it("sends the code to the verified number, else the listed one", () => {
    expect(codeDestination(state({ verified: mine, listed: theirs }))).toBe(mine);
    expect(codeDestination(state({ listed: "+971 50 123 4567" }))).toBe(mine);
    expect(codeDestination(state({ listed: "050 123" }))).toBeNull();
  });
  it("never lets another number take over a talent account without a code", () => {
    expect(mayAttachPhone(theirs, state({ verified: mine }))).toBe(false);
    expect(mayAttachPhone(theirs, state({ listed: mine }))).toBe(false);
    expect(mayAttachPhone(mine, state({ listed: mine }))).toBe(true);
    expect(mayAttachPhone(theirs, state({ verified: mine, granted: true }))).toBe(true);
    expect(mayAttachPhone(theirs, state())).toBe(true);
    expect(mayAttachPhone(theirs, state({ talent: false, verified: mine }))).toBe(true);
  });
  it("hides the middle of a number", () => {
    expect(maskPhone(mine)).toBe("+971••••••567");
  });
  it("checks bank details", () => {
    const form = { account_type: "personal", holder_name: " A Name ", bank_name: "Bank", branch: "", iban: "ae07 0331 2345 6789 0123 456", swift: "" };
    expect(bankProblem(form)).toBeNull();
    expect(cleanBank(form).iban).toBe("AE070331234567890123456");
    for (const bad of [{ holder_name: " " }, { iban: "AE07" }, { swift: "12" }, { branch: "x".repeat(81) }]) expect(bankProblem({ ...form, ...bad })).toBeTruthy();
  });
});
