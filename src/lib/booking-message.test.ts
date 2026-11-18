import { describe, it, expect } from "vitest";
import { formatBookingMessage, formatBookingConfirm } from "./booking-message";
import { maskContacts } from "./masking";

describe("formatBookingMessage", () => {
  it("matches the requested layout", () => {
    const msg = formatBookingMessage({ name: "Dede Fajar Kurniawan", artistName: "DJ Falcon", eventDate: "2026-10-26", startTime: "13:00", endTime: "15:00",
      performMinutes: 120, guests: 400, budget: 5000, packages: [{ title: "Essential", price: 4500 }], note: null });
    expect(msg).toBe("Hi i'm Dede Fajar Kurniawan\nwant to book :\n---\nArtist: DJ Falcon\nEvent Date: 26 October 2026\nTime: 13:00 - 15:00\nPerformance Duration: 120 Minutes\nGuest : 400 People\nBudget: AED 5,000\n---\nPackages: Essential\n4,500\n---\nPlease Check Schedule");
    expect(maskContacts(msg)).toBe(msg);
  });
  it("puts the venue above the time and builds the AI confirmation", () => {
    const base = { name: "DedeFajarKurniawan", artistName: "Dede", eventDate: "2026-12-12", venue: "Al Furjan", startTime: "21:00", endTime: "22:00", performMinutes: 60, guests: 1000, budget: 6000 };
    expect(formatBookingMessage({ ...base, packages: [], note: null })).toContain("Event Date: 12 December 2026\nVenue Event: Al Furjan\nTime: 21:00 - 22:00");
    expect(formatBookingConfirm(base)).toBe("Hi DedeFajarKurniawan\n---\nArtist: Dede\nEvent Date: 12 December 2026\nVenue Event: Al Furjan\nTime: 21:00 - 22:00\nPerformance Duration: 60 Minutes\nGuest : 1,000 People\nBudget: AED 6,000\n---\nThis is your booking?\nHave any request?");
  });
});
