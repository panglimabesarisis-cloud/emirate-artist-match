import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { FlowVariableSelect } from "@/components/flow/FlowVariableSelect";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = () => false;
});

describe("Save response picker", () => {
  it("opens with the answers taken from the conversation first", () => {
    const onChange = vi.fn();
    render(<FlowVariableSelect button value={undefined} onChange={onChange} variables={["budget", "event_date"]} captured={[{ name: "event_date", from: "Date form" }]} />);
    const trigger = screen.getByRole("combobox", { name: "Save response" });
    expect(trigger).toHaveTextContent("Save response");
    fireEvent.keyDown(trigger, { key: "Enter" });
    expect(screen.getByText("Taken from the conversation")).toBeInTheDocument();
    expect(screen.getAllByRole("option").map(option => option.textContent)).toEqual(["Don't save", "event_date · Date form", "budget", "Add new variable"]);
    fireEvent.keyDown(screen.getByRole("option", { name: /event_date/ }), { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("event_date");
  });
});
