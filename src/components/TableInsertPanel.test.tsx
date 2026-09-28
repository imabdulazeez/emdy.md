import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { createSignal } from "solid-js";
import { describe, expect, it, vi } from "vite-plus/test";
import TableInsertPanel from "./TableInsertPanel";

function mount(onInsert = vi.fn(), onClose = vi.fn()) {
  const [open, setOpen] = createSignal(true);
  const result = render(() => (
    <div>
      <button type="button">outside</button>
      <TableInsertPanel open={open()} onClose={onClose} onInsert={onInsert} />
    </div>
  ));
  return { ...result, onInsert, onClose, setOpen };
}

describe("TableInsertPanel", () => {
  it("renders row, column, and header controls with defaults", () => {
    mount();
    expect(screen.getByRole("dialog", { name: "Insert table" })).toBeInTheDocument();
    expect(screen.getByLabelText("Rows")).toHaveValue(3);
    expect(screen.getByLabelText("Columns")).toHaveValue(3);
    expect(screen.getByLabelText("Include header row")).toBeChecked();
  });

  it("renders nothing while closed", () => {
    const [open] = createSignal(false);
    render(() => <TableInsertPanel open={open()} onClose={vi.fn()} onInsert={vi.fn()} />);
    expect(screen.queryByRole("dialog", { name: "Insert table" })).toBeNull();
  });

  it("submits the chosen size and header option", async () => {
    const user = userEvent.setup();
    const { onInsert } = mount();
    await user.clear(screen.getByLabelText("Rows"));
    await user.type(screen.getByLabelText("Rows"), "5");
    await user.clear(screen.getByLabelText("Columns"));
    await user.type(screen.getByLabelText("Columns"), "4");
    await user.click(screen.getByLabelText("Include header row"));
    await user.click(screen.getByRole("button", { name: "Insert table" }));
    expect(onInsert).toHaveBeenCalledWith({ rows: 5, columns: 4, header: false });
  });

  it("clamps out-of-range values on submit", async () => {
    const user = userEvent.setup();
    const { onInsert } = mount();
    await user.clear(screen.getByLabelText("Rows"));
    await user.type(screen.getByLabelText("Rows"), "99");
    await user.clear(screen.getByLabelText("Columns"));
    await user.click(screen.getByRole("button", { name: "Insert table" }));
    expect(onInsert).toHaveBeenCalledWith({ rows: 20, columns: 1, header: true });
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const { onClose } = mount();
    await user.type(screen.getByLabelText("Rows"), "{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("closes when pointing outside the panel", async () => {
    const user = userEvent.setup();
    const { onClose } = mount();
    await user.click(screen.getByRole("button", { name: "outside" }));
    expect(onClose).toHaveBeenCalled();
  });
});
