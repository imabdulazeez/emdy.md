import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import ImportInput from "./ImportInput";

describe("ImportInput", () => {
  it("renders a hidden file input that accepts JSON exports", () => {
    let input: HTMLInputElement | undefined;
    render(() => <ImportInput ref={(el) => (input = el)} />);
    const field = screen.getByLabelText("Import documents file");
    expect(field).toBe(input);
    expect(field).toHaveAttribute("type", "file");
    expect(field).toHaveAttribute("accept", ".json,application/json");
    expect(field).toHaveClass("hidden");
    expect(field).toHaveAttribute("tabindex", "-1");
  });

  it("hands the chosen file to the importer and clears the selection", async () => {
    const user = userEvent.setup();
    const onImport = vi.fn(async () => undefined);
    render(() => <ImportInput onImport={onImport} />);
    const field = screen.getByLabelText<HTMLInputElement>("Import documents file");
    const file = new File(["{}"], "emdy.json", { type: "application/json" });
    await user.upload(field, file);
    expect(onImport).toHaveBeenCalledWith(file);
    expect(field.value).toBe("");
    await user.upload(field, file);
    expect(onImport).toHaveBeenCalledTimes(2);
  });
});
