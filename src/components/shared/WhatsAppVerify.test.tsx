import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

const setting = vi.hoisted(() => ({ required: true }));
const fns = vi.hoisted(() => ({
  request: vi.fn(async () => ({ ok: true, id: "11111111-1111-4111-8111-111111111111" })),
  confirm: vi.fn(async ({ data }: { data: { code: string } }) => data.code === "123456" ? { ok: true, phone: "+971501234567", proof: `${Date.now() + 100000}.sig` } : { ok: false, error: "wrong_code" }),
  claim: vi.fn(async () => ({ ok: false })),
}));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { value: { required: setting.required } } }) }) }) }) } }));
vi.mock("@/lib/phone-otp.functions", () => ({ requestPhoneCode: fns.request, confirmPhoneCode: fns.confirm, claimVerifiedPhone: fns.claim }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/i18n", () => ({ useI18n: () => ({ t: (s: string) => s }) }));

import { useWhatsAppProof, WhatsAppVerify } from "./WhatsAppVerify";

const submitted = vi.fn();
function Form() {
  const [phone, setPhone] = useState("");
  const { ready } = useWhatsAppProof(phone);
  return <form onSubmit={(e) => { e.preventDefault(); submitted(); }}><WhatsAppVerify phone={phone} onChange={setPhone} /><button type="submit" disabled={!ready}>Book</button></form>;
}
const show = () => render(<QueryClientProvider client={new QueryClient()}><Form /></QueryClientProvider>);

beforeEach(() => { localStorage.clear(); setting.required = true; vi.clearAllMocks(); });
afterEach(cleanup);

describe("WhatsAppVerify", () => {
  it("unblocks the form only after the right code, without submitting it", async () => {
    show();
    const book = screen.getByRole("button", { name: "Book" }) as HTMLButtonElement;
    fireEvent.change(screen.getByLabelText("WhatsApp number"), { target: { value: "+971501234567" } });
    expect(book.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    const code = await screen.findByLabelText("6-digit code");
    fireEvent.change(code, { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(fns.confirm).toHaveBeenCalledTimes(1));
    expect(book.disabled).toBe(true);
    fireEvent.change(code, { target: { value: "123456" } });
    await waitFor(() => expect((screen.getByRole("button", { name: "Verify" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.keyDown(code, { key: "Enter" });
    expect(await screen.findByText("WhatsApp number verified")).toBeTruthy();
    expect(book.disabled).toBe(false);
    expect(submitted).not.toHaveBeenCalled();
    // A different number needs its own code.
    fireEvent.change(screen.getByLabelText("WhatsApp number"), { target: { value: "+971500000000" } });
    expect(book.disabled).toBe(true);
  });

  it("remembers a verified number on this device", async () => {
    localStorage.setItem("dm_whatsapp", JSON.stringify({ phone: "+971501234567", proof: `${Date.now() + 100000}.sig` }));
    show();
    expect(await screen.findByText("WhatsApp number verified")).toBeTruthy();
    expect((screen.getByLabelText("WhatsApp number") as HTMLInputElement).value).toBe("+971501234567");
  });

  it("asks for no code while the requirement is off", async () => {
    setting.required = false;
    show();
    await waitFor(() => expect((screen.getByRole("button", { name: "Book" }) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByRole("button", { name: "Send code" })).toBeNull();
  });
});
