import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { flush } from "solid-js";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { focusMode, resetUiState, setFocusMode } from "~/state/ui";
import ExitFocusButton from "./ExitFocusButton";

afterEach(() => resetUiState());

describe("ExitFocusButton", () => {
  it("advertises the exit-focus shortcut", () => {
    render(() => <ExitFocusButton />);
    const button = screen.getByRole("button", { name: "Exit focus mode" });
    expect(button).toHaveAttribute("title", "Exit focus mode (Esc)");
    expect(button).toHaveAttribute("aria-keyshortcuts", "Escape");
  });

  it("leaves focus mode when clicked", async () => {
    const user = userEvent.setup();
    flush(() => setFocusMode(true));
    render(() => <ExitFocusButton class="size-6" />);
    const button = screen.getByRole("button", { name: "Exit focus mode" });
    expect(button).toHaveClass("icon-button", "size-6");
    await user.click(button);
    expect(focusMode()).toBe(false);
  });
});
