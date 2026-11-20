import { describe, expect, it } from "vitest";
import { validateAttachment, attachmentInConversation, encodeChatMessage, decodeChatMessage } from "./chat-attachments";
describe("private chat attachments", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  it.each(["image/jpeg", "application/pdf", "video/mp4"])("accepts client %s attachments", (type) => {
    expect(validateAttachment({ name: "brief", type, size: 100 }).type).toBe(type);
  });
  it("rejects unsupported or oversized files", () => {
    expect(() => validateAttachment({ name: "x", type: "text/html", size: 1 })).toThrow();
    expect(() => validateAttachment({ name: "x", type: "application/pdf", size: 52428801 })).toThrow();
  });
  it("cannot attach a file from another conversation or artist gallery", () => {
    expect(attachmentInConversation(`chat/${id}/${id}.pdf`, id)).toBe(true);
    expect(attachmentInConversation(`other/${id}.pdf`, id)).toBe(false);
    expect(attachmentInConversation(`chat/${id}/../${id}.pdf`, id)).toBe(false);
  });
  it("masks chat text and never persists signed URLs", () => {
    const body = encodeChatMessage("Email me test@example.com", [{ path: `chat/${id}/${id}.pdf`, name: "brief.pdf", type: "application/pdf", size: 100, url: "https://private.invalid/signed" }]);
    expect(decodeChatMessage(body).text).toBe("Email me [contact hidden]");
    expect(body).not.toContain("https://");
  });
});