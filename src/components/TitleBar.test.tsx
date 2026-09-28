import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { TEST_DOCUMENTS } from "~/test-documents";
import { flush } from "solid-js";
import { ariaKeyShortcuts, isMacPlatform, shortcutKeys, shortcutTitle } from "~/lib/shortcuts";
import { resetDocumentState } from "~/state/document";
import { registerEditorApi, resetEditorApiState } from "~/state/editor-api";
import { layoutMode, resetLayoutState, setLayoutMode } from "~/state/layout";
import { resetThemeState } from "~/state/theme";
import { focusMode, resetUiState, setSidebarOpen, sidebarOpen } from "~/state/ui";
import TitleBar from "./TitleBar";
import { SidebarProvider } from "./ui/sidebar";

beforeEach(() => resetDocumentState(TEST_DOCUMENTS));

afterEach(() => {
  resetDocumentState(TEST_DOCUMENTS);
  resetLayoutState();
  resetThemeState();
  resetUiState();
  resetEditorApiState();
});

function mount() {
  return render(() => (
    <SidebarProvider open={sidebarOpen()} onOpenChange={setSidebarOpen}>
      <TitleBar />
    </SidebarProvider>
  ));
}

describe("TitleBar", () => {
  it("shows when the document was last edited beside its title", () => {
    mount();
    const title = screen.getByRole("button", { name: /Document title/ });
    const edited = screen.getByTestId("last-edited");
    expect(edited.textContent).toMatch(/^Edited /);
    expect(title.compareDocumentPosition(edited) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows the sidebar trigger, title, mode toggle, formatting, and focus control", () => {
    mount();
    expect(screen.getByRole("banner", { name: "Toolbar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide sidebar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Document title/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View: Raw Markdown" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Text formatting" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enter focus mode" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Theme" })).toBeNull();
  });

  it("advertises the registered shortcuts for the sidebar and focus mode", () => {
    const mac = isMacPlatform();
    mount();
    const cases = [
      ["Hide sidebar", "Toggle sidebar", "toggle-sidebar"],
      ["Enter focus mode", "Focus mode", "toggle-focus"],
    ] as const;
    for (const [name, label, id] of cases) {
      const button = screen.getByRole("button", { name });
      expect(button).toHaveAttribute("title", shortcutTitle(label, shortcutKeys(id), mac));
      expect(button).toHaveAttribute("aria-keyshortcuts", ariaKeyShortcuts(shortcutKeys(id), mac));
    }
    expect(screen.getByRole("button", { name: "Enter focus mode" })).toHaveAttribute(
      "title",
      expect.stringMatching(/^Focus mode \((⌘⇧F|Ctrl\+Shift\+F)\)$/),
    );
  });

  it("keeps the export menu available in the read-only preview", () => {
    mount();
    flush(() => setLayoutMode("reader"));
    expect(screen.queryByRole("group", { name: "Text formatting" })).toBeNull();
    expect(screen.getByRole("button", { name: "Export" })).toBeEnabled();
  });

  it("hides formatting controls in the read-only preview", () => {
    mount();
    flush(() => setLayoutMode("reader"));
    expect(screen.queryByRole("group", { name: "Text formatting" })).toBeNull();
    expect(screen.getByRole("button", { name: "View: Read-only preview" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enter focus mode" })).toBeInTheDocument();
    flush(() => setLayoutMode("preview"));
    expect(screen.getByRole("group", { name: "Text formatting" })).toBeInTheDocument();
  });

  it("lays everything out on a single row: title, then view switch, then formatting", () => {
    mount();
    const header = screen.getByRole("banner", { name: "Toolbar" });
    const title = screen.getByRole("button", { name: /Document title/ });
    const view = screen.getByRole("button", { name: "View: Raw Markdown" }).parentElement!;
    const formatting = screen.getByRole("group", { name: "Text formatting" });
    const exportMenu = screen.getByRole("button", { name: "Export" });
    expect(header.className).toMatch(/\bh-11\b/);
    expect(header.className).not.toMatch(/flex-col/);
    expect(view.parentElement).toBe(header);
    expect(formatting.parentElement).toBe(header);
    expect(title.compareDocumentPosition(view) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      view.compareDocumentPosition(formatting) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      formatting.compareDocumentPosition(exportMenu) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("does not clip toolbar dropdowns", () => {
    mount();
    const header = screen.getByRole("banner", { name: "Toolbar" });
    expect(header.className).not.toMatch(/overflow-/);
  });

  it("switches the view from the toolbar dropdown", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "View: Raw Markdown" }));
    await user.click(await screen.findByRole("menuitemradio", { name: "Editable preview" }));
    expect(layoutMode()).toBe("preview");
    expect(screen.getByRole("button", { name: "View: Editable preview" })).toBeInTheDocument();
  });

  it("sends formatting actions to the registered editor", async () => {
    const user = userEvent.setup();
    const runCommand = vi.fn(() => true);
    flush(() =>
      registerEditorApi({
        scrollToLine: vi.fn(),
        focus: vi.fn(),
        getText: () => "",
        flush: vi.fn(),
        runCommand,
        applyEdits: vi.fn(),
      }),
    );
    mount();
    await user.click(screen.getByRole("button", { name: "Bold" }));
    expect(runCommand).toHaveBeenCalledTimes(1);
  });

  it("toggles the app sidebar", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Hide sidebar" }));
    expect(sidebarOpen()).toBe(false);
    expect(screen.getByRole("button", { name: "Show sidebar" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("enters focus mode", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Enter focus mode" }));
    expect(focusMode()).toBe(true);
  });
});
