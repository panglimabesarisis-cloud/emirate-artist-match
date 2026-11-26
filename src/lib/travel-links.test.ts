import { describe, expect, it } from "vitest";
import { addresses, keepKnownLinks, travelLinks, wantsDeepSearch, type LinkRequest } from "./travel-links";

const none: LinkRequest = { kind: "flight", from: null, to: null, fromCode: null, toCode: null, depart: null, returnDate: null, direct: null, airlines: null, city: null, country: null, checkIn: null, checkOut: null, guests: null, keywords: null };

describe("travel links", () => {
  it("fills the route, date, airline and direct flight into the search", () => {
    const links = travelLinks({ ...none, from: "Jakarta", to: "Dubai", fromCode: "cgk", toCode: "dxb", depart: "2027-05-04", direct: true, airlines: ["Emirates"] });
    expect(decodeURIComponent(links[1]!.url)).toBe("https://www.google.com/travel/flights?q=Nonstop flights from Jakarta to Dubai on 2027-05-04 one way with Emirates");
    expect(links.map((l) => l.url)).toContain("https://www.skyscanner.net/transport/flights/cgk/dxb/270504/?adultsv2=1&preferdirects=true&rtn=0");
    expect(links.map((l) => l.url)).toContain("https://www.kayak.com/flights/CGK-DXB/2027-05-04?sort=bestflight_a&fs=stops%3D0");
  });
  it("fills hotel dates and refuses an empty request", () => {
    expect(travelLinks({ ...none, kind: "hotel", city: "Dubai", checkIn: "2027-05-04", checkOut: "2027-05-06", guests: 2 })[0]!.url).toContain("ss=Dubai&no_rooms=1&group_adults=2&checkin=2027-05-04&checkout=2027-05-06");
    expect(() => travelLinks(none)).toThrow();
  });
  it("removes addresses that nothing returned", () => {
    const known = addresses("see https://real.example/page?a=1 and more");
    const reply = "[Good](https://real.example/page?a=1) [Bad](https://made.up/x) plain https://made.up/y end";
    expect(keepKnownLinks(reply, known)).toBe("[Good](https://real.example/page?a=1) Bad plain  end");
  });
  it("points a made-up or missing link at the page the search found", () => {
    const sources = [{ title: "emirates.com", url: "https://www.emirates.com/id/english/destinations/jakarta-dubai/" }, { title: "traveloka.com", url: "https://www.traveloka.com/en-id/flight/route/CGK-DXB" }];
    const reply = "| Penyedia | Sumber |\n| --- | --- |\n| Emirates | [Emirates](https://www.emirates.com/id/english/) |\n| Traveloka | Traveloka |";
    expect(keepKnownLinks(reply, [], sources)).toBe(`| Penyedia | Sumber |\n| --- | --- |\n| Emirates | [Emirates](${sources[0]!.url}) |\n| Traveloka | [Traveloka](${sources[1]!.url}) |`);
  });
  it("recognises deep search requests", () => {
    for (const text of ["/deepsearch dubai", "/deepseach x", "Find Flight\nDate:", "Research\nTopic:"]) expect(wantsDeepSearch(text), text).toBe(true);
    expect(wantsDeepSearch("How many bookings?")).toBe(false);
  });
});
