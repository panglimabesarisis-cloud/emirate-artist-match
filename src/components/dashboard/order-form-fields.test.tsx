// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OrderFormFields, asOrderField, type OrderField } from "./OrderFormBuilder";

afterEach(cleanup);
const field = (type: string): OrderField => ({ id: "q", label: "About you", type: type as OrderField["type"], required: false, options: [] });

describe("long answers", () => {
  it("gives a template's long question a large box", () => {
    for (const type of ["long", "paragraph"]) {
      const view = render(<OrderFormFields fields={[field(type)]} values={{}} onChange={() => {}} />);
      expect(view.container.querySelector("textarea")?.getAttribute("maxlength")).toBe("500");
      expect(view.container.querySelector("input")).toBeNull();
      cleanup();
    }
  });
  it("leaves the other types as they are", () => {
    expect(asOrderField(field("short")).type).toBe("short");
    expect(asOrderField(field("long")).type).toBe("paragraph");
  });
});
