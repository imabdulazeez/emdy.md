import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { DESKTOP_BRIDGE_KEY } from "~/lib/desktop/bridge";
import { isMacPlatform } from "~/lib/shortcuts";
import { resetUiState, setShortcutsOpen, shortcutsOpen } from "~/state/ui";
import ShortcutsPanel from "./ShortcutsPanel";

const host = globalThis as Record<string, unknown>;

afterEach(() => {
  resetUiState();
  delete host[DESKTOP_BRIDGE_KEY];
});

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("ShortcutsPanel", () => {
  it("renders nothing while closed", () => {
    render(() => <ShortcutsPanel />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("lists shortcuts grouped by category when open", async () => {
    render(() => <ShortcutsPanel />);
    setShortcutsOpen(true);
    const dialog = await screen.findByRole("dialog", { name: "Keyboard shortcuts" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("heading", { name: "Layout" })).toBeInTheDocument();
    expect(screen.getByText("Toggle focus mode")).toBeInTheDocument();
    expect(screen.getByText("Bold")).toBeInTheDocument();
  });

  it("lists the browser's New document keys outside the desktop app", async () => {
    render(() => <ShortcutsPanel />);
    setShortcutsOpen(true);
    await screen.findByRole("dialog", { name: "Keyboard shortcuts" });
    const row = screen.getByText("New document").parentElement!;
    expect(row).toHaveTextContent(isMacPlatform() ? "⌘⌥N" : "Ctrl+Alt+N");
  });

  it("lists the desktop app's New document keys in the desktop app", async () => {
    host[DESKTOP_BRIDGE_KEY] = {};
    render(() => <ShortcutsPanel />);
    setShortcutsOpen(true);
    await screen.findByRole("dialog", { name: "Keyboard shortcuts" });
    const row = screen.getByText("New document").parentElement!;
    expect(row).toHaveTextContent(isMacPlatform() ? "⌘N" : "Ctrl+N");
    expect(row).not.toHaveTextContent(isMacPlatform() ? "⌘⌥N" : "Ctrl+Alt+N");
  });

  it("moves focus into the dialog and restores it on close", async () => {
    const user = userEvent.setup();
    const trigger = document.createElement("button");
    trigger.textContent = "open";
    document.body.appendChild(trigger);
    trigger.focus();
    render(() => <ShortcutsPanel />);
    setShortcutsOpen(true);
    await screen.findByRole("dialog");
    await flush();
    const close = screen.getByRole("button", { name: "Close shortcuts" });
    expect(close).toHaveFocus();
    await user.click(close);
    expect(shortcutsOpen()).toBe(false);
    await flush();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it("leaves focus alone when it has already moved elsewhere on close", async () => {
    const trigger = document.createElement("button");
    const elsewhere = document.createElement("input");
    document.body.append(trigger, elsewhere);
    trigger.focus();
    render(() => <ShortcutsPanel />);
    setShortcutsOpen(true);
    await screen.findByRole("dialog");
    await flush();
    queueMicrotask(() => elsewhere.focus());
    setShortcutsOpen(false);
    await flush();
    await new Promise((resolve) => setTimeout(resolve));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(elsewhere).toHaveFocus();
    trigger.remove();
    elsewhere.remove();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    render(() => <ShortcutsPanel />);
    setShortcutsOpen(true);
    await screen.findByRole("dialog");
    await flush();
    await user.keyboard("{Escape}");
    expect(shortcutsOpen()).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("traps Tab inside the dialog", async () => {
    const user = userEvent.setup();
    render(() => <ShortcutsPanel />);
    setShortcutsOpen(true);
    await screen.findByRole("dialog");
    await flush();
    const close = screen.getByRole("button", { name: "Close shortcuts" });
    expect(close).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(close).toHaveFocus();
  });

  it("closes when the backdrop is clicked", async () => {
    const user = userEvent.setup();
    render(() => <ShortcutsPanel />);
    setShortcutsOpen(true);
    const dialog = await screen.findByRole("dialog");
    await user.click(dialog.parentElement!);
    expect(shortcutsOpen()).toBe(false);
  });
});
