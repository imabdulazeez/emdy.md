import { fireEvent, render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal, flush } from "solid-js";
import { describe, expect, it, vi } from "vite-plus/test";
import { normalizeHex } from "~/lib/themes/color";
import ColorField from "./ColorField";

function mount(initial = "#2d4bd1") {
  const [value, setValue] = createSignal(initial);
  const onChange = vi.fn((next: string) => {
    const color = normalizeHex(next);
    if (color) setValue(color);
    return color !== null;
  });
  render(() => <ColorField label="Accent" value={value()} onChange={onChange} />);
  return { value, onChange };
}

describe("ColorField", () => {
  it("shows the colour in a picker and a hex field", () => {
    mount();
    expect(screen.getByLabelText("Accent colour")).toHaveValue("#2d4bd1");
    expect(screen.getByRole("textbox", { name: "Accent hex value" })).toHaveValue("#2d4bd1");
    expect(screen.getByText("Accent")).toBeInTheDocument();
  });

  it("reports picker changes as they happen", () => {
    const { value, onChange } = mount();
    fireEvent.input(screen.getByLabelText("Accent colour"), { target: { value: "#112233" } });
    expect(onChange).toHaveBeenCalledWith("#112233");
    flush();
    expect(value()).toBe("#112233");
  });

  it("commits a typed hex value on Enter", async () => {
    const user = userEvent.setup();
    const { value } = mount();
    const field = screen.getByRole("textbox", { name: "Accent hex value" });
    await user.clear(field);
    await user.type(field, "C36{Enter}");
    expect(value()).toBe("#cc3366");
    expect(field).toHaveValue("#cc3366");
    expect(screen.getByLabelText("Accent colour")).toHaveValue("#cc3366");
  });

  it("reverts an invalid value when the field loses focus", async () => {
    const user = userEvent.setup();
    const { value } = mount();
    const field = screen.getByRole("textbox", { name: "Accent hex value" });
    await user.clear(field);
    await user.type(field, "banana");
    await user.tab();
    expect(value()).toBe("#2d4bd1");
    expect(field).toHaveValue("#2d4bd1");
  });

  it("shows the canonical value when the typed colour equals the current one", async () => {
    const user = userEvent.setup();
    const { value, onChange } = mount("#aabbcc");
    const field = screen.getByRole("textbox", { name: "Accent hex value" });
    await user.clear(field);
    await user.type(field, "abc{Enter}");
    expect(onChange).toHaveBeenCalledWith("abc");
    expect(value()).toBe("#aabbcc");
    expect(field).toHaveValue("#aabbcc");
  });
});
