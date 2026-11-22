import { describe, expect, it } from "vitest";
import { clientNameFromMessages, cleanName, inboxLabelFor } from "./chat-client-name";

describe("clientNameFromMessages", () => {
  it("reads a form answer", () => {
    expect(clientNameFromMessages(["Hi", "Client name: Sara Al Mansoori\nEvent type: Wedding"])).toBe("Sara Al Mansoori");
    expect(clientNameFromMessages(["Name: Alex\nVenue: Atlantis"])).toBe("Alex");
    expect(clientNameFromMessages(["client_name: Omar"])).toBe("Omar");
  });
  it("reads a sentence in English and Indonesian", () => {
    expect(clientNameFromMessages(["Hello, my name is Rina Putri and I need a DJ"])).toBe("Rina Putri");
    expect(clientNameFromMessages(["Halo, nama saya Budi."])).toBe("Budi");
  });
  it("prefers form answers over sentences", () => {
    expect(clientNameFromMessages(["my name is Joke", "Name: Real Person"])).toBe("Real Person");
  });
  it("ignores contact details and placeholders", () => {
    expect(clientNameFromMessages(["Name: ***", "Name: test@mail.com", "Name: Client", "Name: 0501234567"])).toBeNull();
    expect(clientNameFromMessages(["Hi, I'd like to chat about a booking."])).toBeNull();
  });
  it("cleans a name", () => {
    expect(cleanName("  Sara  ")).toBe("Sara");
    expect(cleanName("A")).toBeNull();
  });
});

describe("inboxLabelFor", () => {
  it("is an inquiry with no booking", () => {
    expect(inboxLabelFor([])).toBe("inquiry");
    expect(inboxLabelFor([{ status: "cancelled", total: 100, paid_amount: 0 }])).toBe("inquiry");
  });
  it("follows the money", () => {
    expect(inboxLabelFor([{ status: "quoted", total: 100, paid_amount: 0 }])).toBe("pending");
    expect(inboxLabelFor([{ status: "confirmed", total: 100, paid_amount: 30 }])).toBe("partial");
    expect(inboxLabelFor([{ status: "confirmed", total: 100, paid_amount: 100 }])).toBe("paid");
  });
});
