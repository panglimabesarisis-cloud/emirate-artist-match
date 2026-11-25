import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ oauth: vi.fn(), user: null as null | { id: string }, loading: false }));
vi.mock("@/integrations/lovable/index", () => ({ lovable: { auth: { signInWithOAuth: mocks.oauth } } }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: mocks.user, loading: mocks.loading }) }));

import { ClientChatGate } from "@/components/chat/ClientChatGate";
import { saveBookingDraft, takeBookingDraft } from "@/lib/booking-draft";

beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); mocks.user = null; mocks.loading = false; });

describe("signing in before a chat", () => {
  it("shows the Google window instead of the chat and returns there afterwards", async () => {
    mocks.oauth.mockResolvedValue({ redirected: true, error: null });
    render(<ClientChatGate returnTo="/chat/c1?k=key"><p>secret chat</p></ClientChatGate>);
    expect(screen.queryByText("secret chat")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() => expect(mocks.oauth).toHaveBeenCalledWith("google", { redirect_uri: `${window.location.origin}/auth` }));
    expect(sessionStorage.getItem("post_auth")).toBe("/chat/c1?k=key");
    expect(screen.getByRole("link", { name: "Use email instead" })).toHaveAttribute("href", "/auth?mode=signup&redirect=%2Fchat%2Fc1%3Fk%3Dkey");
  });

  it("opens the chat for a signed-in client", () => {
    mocks.user = { id: "u1" };
    render(<ClientChatGate returnTo="/chat/c1?k=key"><p>secret chat</p></ClientChatGate>);
    expect(screen.getByText("secret chat")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("gives the typed form back once, only to the same artist and only for a while", () => {
    saveBookingDraft({ artistId: "a1", send: "form", state: { chatText: "hi" } }, 1000);
    expect(takeBookingDraft("a2", 2000)).toBeNull();
    expect(takeBookingDraft("a1", 2000)).toMatchObject({ send: "form", state: { chatText: "hi" } });
    expect(takeBookingDraft("a1", 2000)).toBeNull();
    saveBookingDraft({ artistId: "a1", send: "chat", state: {} }, 1000);
    expect(takeBookingDraft("a1", 1000 + 31 * 60_000)).toBeNull();
  });
});
