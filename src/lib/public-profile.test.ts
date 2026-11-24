import { describe, expect, it } from "vitest";
import { artistOwnedMediaPath, publicPhysicalDetails } from "./public-profile";

describe("public professional profile boundaries", () => {
  it("signs only the selected artist's own stored files", () => {
    expect(artistOwnedMediaPath("artist-a", "artist-a/profile.jpg")).toBe("artist-a/profile.jpg");
    expect(artistOwnedMediaPath("artist-a", "artist-b/profile.jpg")).toBeNull();
    expect(artistOwnedMediaPath("artist-a", "artist-a/../artist-b/profile.jpg")).toBeNull();
  });
  it("publishes saved professional details without unrelated private keys", () => {
    expect(publicPhysicalDetails({ height_cm: 182, weight_kg: 80, hair: "Black", eyes: "Brown", clothing: "XL", shoe_eu: 43, email: "private@example.com", balance: 500 })).toEqual([
      { label: "Height", value: "182 cm" }, { label: "Weight", value: "80 kg" },
      { label: "Hair color", value: "Black" }, { label: "Eye color", value: "Brown" },
      { label: "Clothing size", value: "XL" }, { label: "Shoe size (EU)", value: "43" },
    ]);
  });
});