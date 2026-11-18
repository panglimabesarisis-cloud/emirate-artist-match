import { describe, it, expect } from "vitest";
import { formatBookingMessage } from "./booking-message";
import { maskContacts } from "./masking";

describe("formatBookingMessage", () => {
  it("matches the requested layout", () => {
    const msg = formatBookingMessage({ name: "Dede Fajar Kurniawan", artistName: "DJ Falcon", eventDate: "2026-10-26", startTime: "13:00", endTime: "15:00",
      performMinutes: 120, guests: 400, budget: 5000, packages: [{ title: "Essential", price: 4500 }], note: null });
    expect(msg).toBe("Hi i'm Dede Fajar Kurniawan\nwant to book :\n---\nArtist: DJ Falcon\nEvent Date: 26 October 2026\nTime: 13:00 - 15:00\nPerformance Duration: 120 Minutes\nGuest : 400 People\nBudget: AED 5,000\n---\nPackages: Essential\n4,500\n---\nPlease Check Schedule");
    expect(maskContacts(msg)).toBe(msg);
  });
});
