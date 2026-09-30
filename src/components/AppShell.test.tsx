import { render, screen, waitFor, within } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { flush } from "solid-js";
import { DESKTOP_BRIDGE_KEY } from "~/lib/desktop/bridge";
import { createMemoryBridge } from "~/lib/desktop/memory-bridge";
import { createMemoryDirectory, type MemoryDirectory } from "~/lib/storage/directory";
import { seedDirectory } from "~/lib/storage/fixtures";
import { TEST_DOCUMENTS } from "~/test-documents";
import { resetCursorState } from "~/state/cursor";
import { documentHref } from "~/lib/route";
import { cursor } from "~/state/cursor";
import {
  activeDocumentId,
  createDocument,
  deleteDocument,
  documents,
  findDocument,
  resetDocumentState,
  setDocText,
  setTitle,
  title,
  updateDocumentText,
} from "~/state/document";
import { resetEditorApiState } from "~/state/editor-api";
import { layoutMode, resetLayoutState } from "~/state/layout";
import { resetLibraryState, startLibrary, useLibraryDirectory } from "~/state/library";
import { resetNavigationState, view } from "~/state/navigation";
import { resetStatsState } from "~/state/stats";
import { BUILT_IN_THEMES, DEFAULT_THEME } from "~/lib/themes/palettes";
import { resetThemeState, selectTheme, setThemePreference } from "~/state/theme";
import {
  beginThemeDraft,
  resetThemeDraft,
  setDraftAppearance,
  themeDraft,
} from "~/state/theme-draft";
import {
  focusMode,
  resetUiState,
  setFocusMode,
  setSidebarOpen,
  shortcutsOpen,
  sidebarOpen,
} from "~/state/ui";
import {
  SHORTCUTS,
  ariaKeyShortcuts,
  formatShortcut,
  isMacPlatform,
  keysFor,
} from "~/lib/shortcuts";
import { resetWorkspaceState } from "~/state/workspace";

import { getRenderClient } from "~/lib/preview/render-client";
vi.mock("~/lib/preview/render-client", () => ({
  getRenderClient: vi.fn(() => ({
    render: vi.fn(async (source: string) => `<p data-line="1">${source}</p>`),
    terminate: vi.fn(),
  })),
}));

import AppShell from "./AppShell";

const currentHref = (id: string) => documentHref(findDocument(id)!);
const location = () =>
  `${window.location.pathname}${window.location.search}${window.location.hash}`;
const documentLocation = () => location().replace(/(#\/d\/[^/]+)\/[^/]+$/, "$1");

let restoreDirectory: (() => void) | undefined;
let libraryDirectory: MemoryDirectory;
const host = globalThis as Record<string, unknown>;

async function boot(seed = true) {
  restoreDirectory?.();
  resetLibraryState();
  const directory = createMemoryDirectory();
  libraryDirectory = directory;
  if (seed) await seedDirectory(directory, TEST_DOCUMENTS);
  restoreDirectory = useLibraryDirectory(async () => directory);
  await startLibrary();
  flush();
}

beforeEach(() => boot());

afterEach(() => {
  delete host[DESKTOP_BRIDGE_KEY];
  restoreDirectory?.();
  restoreDirectory = undefined;
  resetLibraryState();
  resetNavigationState();
  resetDocumentState();
  resetLayoutState();
  resetThemeState();
  resetThemeDraft();
  resetUiState();
  resetStatsState();
  resetCursorState();
  resetEditorApiState();
  resetWorkspaceState();
  delete document.documentElement.dataset.theme;
  document.documentElement.removeAttribute("style");
  window.history.replaceState(null, "", "/");
  vi.restoreAllMocks();
});

function narrowViewport() {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: true,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  );
}

async function mount() {
  flush(() => setDocText("# Heading\n\nbody text"));
  const result = render(() => <AppShell />);
  await screen.findByRole("textbox", { name: "Markdown editor" });
  return result;
}

describe("AppShell", () => {
  it("welcomes an empty library and swaps in the editor around the first document", async () => {
    const user = userEvent.setup();
    await boot(false);
    render(() => <AppShell />);
    expect(await screen.findByTestId("empty-library")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Welcome to emdy" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Markdown editor" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Outline" })).toBeNull();
    expect(screen.getByTestId("document-sheet")).toContainElement(
      screen.getByTestId("empty-library"),
    );
    expect(
      within(screen.getByRole("list", { name: "Documents" })).queryAllByRole("button"),
    ).toHaveLength(0);
    expect(location()).toBe("/");
    await user.click(
      within(screen.getByTestId("empty-library")).getByRole("button", { name: "New document" }),
    );
    expect(await screen.findByRole("textbox", { name: "Markdown editor" })).toBeInTheDocument();
    expect(screen.queryByTestId("empty-library")).toBeNull();
    expect(documentLocation()).toBe(`/#/d/untitled-${activeDocumentId()}`);
    expect(screen.queryByRole("textbox", { name: "Document title" })).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Markdown editor" })).toHaveFocus(),
    );
    await user.keyboard("First draft");
    await waitFor(() => expect(title()).toBe("First draft"));
    flush(() => deleteDocument(activeDocumentId()));
    expect(await screen.findByTestId("empty-library")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Markdown editor" })).toBeNull();
    expect(location()).toBe("/");
  });

  it("navigates by short id from the sidebar and restores documents with browser history", async () => {
    const user = userEvent.setup();
    await mount();
    const [first, second] = documents();
    expect(documentLocation()).toBe(documentHref(first));
    await user.click(
      within(screen.getByRole("list", { name: "Documents" })).getByRole("button", {
        name: second.title,
      }),
    );
    expect(documentLocation()).toBe(documentHref(second));
    expect(
      within(screen.getByRole("list", { name: "Documents" })).getByRole("button", {
        name: second.title,
      }),
    ).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("textbox", { name: "Markdown editor" })).toHaveTextContent(
      second.title,
    );
    window.history.back();
    await waitFor(() => expect(activeDocumentId()).toBe(first.id));
    expect(screen.getByRole("textbox", { name: "Markdown editor" })).toHaveTextContent("body text");
    window.history.forward();
    await waitFor(() => expect(activeDocumentId()).toBe(second.id));
  });

  it("opens an existing document id from the initial URL", async () => {
    const target = documents()[2];
    window.history.replaceState(null, "", documentHref(target));
    await mount();
    expect(activeDocumentId()).toBe(target.id);
    expect(documentLocation()).toBe(documentHref(target));
    expect(
      within(screen.getByRole("list", { name: "Documents" })).getByRole("button", {
        name: target.title,
      }),
    ).toHaveAttribute("aria-current", "page");
  });

  it("never places document details in the pathname", async () => {
    const user = userEvent.setup();
    await mount();
    const [, second] = documents();
    expect(window.location.pathname).toBe("/");
    await user.click(
      within(screen.getByRole("list", { name: "Documents" })).getByRole("button", {
        name: second.title,
      }),
    );
    expect(window.location.pathname).toBe("/");
    flush(() => setTitle("Private Journal"));
    expect(window.location.pathname).toBe("/");
    expect(window.location.hash).toMatch(new RegExp(`^#/d/private-journal-${second.id}(/|$)`));
  });

  it.each([
    "/missing",
    "/%ZZ",
    "/nested/path",
    "/#missing",
    "/#/d/",
    "/#/d/zzzzzz",
    "/#/d/notes-zzzzzz",
    "/#/d/a/b",
  ])("replaces an unknown initial URL %s with the active document", async (url) => {
    window.history.replaceState(null, "", url);
    const id = activeDocumentId();
    const historyLength = window.history.length;
    await mount();
    expect(activeDocumentId()).toBe(id);
    expect(documentLocation()).toBe(currentHref(id));
    expect(window.history.length).toBe(historyLength);
  });

  it("updates the URL on creation and deletion and recovers deleted history entries", async () => {
    await mount();
    flush(() => createDocument());
    const id = activeDocumentId();
    expect(documentLocation()).toBe(currentHref(id));
    flush(() => deleteDocument(id));
    const remainingId = activeDocumentId();
    expect(documentLocation()).toBe(currentHref(remainingId));
    const navigated = new Promise<void>((resolve) => {
      window.addEventListener("popstate", () => resolve(), { once: true });
    });
    window.history.back();
    await navigated;
    await waitFor(() => expect(documentLocation()).toBe(currentHref(remainingId)));
    expect(activeDocumentId()).toBe(remainingId);
  });

  it("rewrites the slug on rename without adding a history entry", async () => {
    await mount();
    const id = activeDocumentId();
    const before = documentLocation();
    const historyLength = window.history.length;
    flush(() => setTitle("Project Kickoff Notes"));
    expect(documentLocation()).toBe(`/#/d/project-kickoff-notes-${id}`);
    expect(documentLocation()).not.toBe(before);
    expect(window.history.length).toBe(historyLength);
    expect(activeDocumentId()).toBe(id);
  });

  it("scrolls the editor to the heading named in the URL and keeps it in the fragment", async () => {
    const { id } = documents()[1];
    flush(() => updateDocumentText(id, "# One\n\ntext\n\n## Two\n\nmore text\n\n## Two\n\ntail"));
    const target = documents()[1];
    expect(target.title).toBe("One");
    window.history.replaceState(null, "", documentHref(target, { heading: "two-2" }));
    await mount();
    expect(activeDocumentId()).toBe(target.id);
    await waitFor(() => expect(cursor().line).toBe(9));
    expect(location()).toBe(documentHref(target, { heading: "two-2" }));
    expect(window.location.pathname).toBe("/");
  });

  it("opens a document from a stale slug and corrects the URL", async () => {
    const target = documents()[1];
    window.history.replaceState(null, "", `/?q=1#/d/old-name-${target.id}`);
    const historyLength = window.history.length;
    await mount();
    expect(activeDocumentId()).toBe(target.id);
    expect(documentLocation()).toBe(documentHref(target, { search: "?q=1" }));
    expect(window.history.length).toBe(historyLength);
  });

  it("renders chrome and the editor by default", async () => {
    await mount();
    expect(screen.getByText("emdy")).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Sidebar" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sidebar/ })).toBeNull();
    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Outline" })).toBeInTheDocument();
    expect(screen.getByRole("main", { name: "Document" })).toContainElement(
      screen.getByRole("navigation", { name: "Outline" }),
    );
    expect(screen.getByTestId("editor-pane")).toBeInTheDocument();
    expect(screen.queryByTestId("preview-pane")).toBeNull();
    expect(screen.queryByRole("separator")).toBeNull();
  });

  it("raises the document as a sheet with the status floating inside it", async () => {
    await mount();
    const sheet = screen.getByTestId("document-sheet");
    const main = screen.getByRole("main", { name: "Document" });
    expect(sheet.className).toMatch(/\bsheet\b/);
    expect(sheet).toContainElement(screen.getByRole("banner", { name: "Toolbar" }));
    expect(sheet).toContainElement(main);
    expect(main).toContainElement(screen.getByTestId("document-status"));
    expect(screen.getByTestId("document-status").className).toMatch(/\babsolute\b/);
  });

  it("docks the outline to the left of the editor pane", async () => {
    await mount();
    const outline = screen.getByRole("navigation", { name: "Outline" });
    const pane = screen.getByTestId("editor-pane");
    expect(outline.compareDocumentPosition(pane) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("populates stats and outline from the document", async () => {
    await mount();
    await waitFor(() => expect(screen.getByTestId("status-words-value")).toHaveTextContent("3"));
    expect(await screen.findByRole("button", { name: "Heading" })).toBeInTheDocument();
  });

  it("switches layouts with keyboard shortcuts", async () => {
    const user = userEvent.setup();
    await mount();
    await user.keyboard("{Control>}1{/Control}");
    expect(layoutMode()).toBe("editor");
    expect(screen.queryByTestId("preview-pane")).toBeNull();
    expect(screen.getByTestId("editor-pane")).not.toHaveClass("hidden");
    await user.keyboard("{Control>}2{/Control}");
    expect(layoutMode()).toBe("preview");
    expect(screen.getByTestId("editor-pane")).not.toHaveClass("hidden");
    expect(screen.getByTestId("editor")).toHaveAttribute("data-editor-mode", "preview");
    expect(screen.queryByTestId("preview-pane")).toBeNull();
    await user.keyboard("{Control>}1{/Control}");
    expect(layoutMode()).toBe("editor");
    expect(screen.queryByTestId("preview-pane")).toBeNull();
  });

  it("shows the read-only preview with Mod-3 and hides the editor and formatting", async () => {
    const user = userEvent.setup();
    await mount();
    await user.keyboard("{Control>}3{/Control}");
    expect(layoutMode()).toBe("reader");
    expect(screen.queryByRole("textbox", { name: "Markdown editor" })).toBeNull();
    const preview = screen.getByRole("document", { name: "Preview" });
    expect(preview).toHaveAttribute("aria-readonly", "true");
    expect(screen.getByTestId("editor")).toHaveAttribute("data-editor-mode", "preview");
    expect(screen.queryByRole("group", { name: "Text formatting" })).toBeNull();
    expect(screen.getByRole("navigation", { name: "Outline" })).toBeInTheDocument();
    await user.keyboard("{Control>}1{/Control}");
    expect(layoutMode()).toBe("editor");
    expect(screen.getByRole("textbox", { name: "Markdown editor" })).toBe(preview);
    expect(screen.getByRole("group", { name: "Text formatting" })).toBeInTheDocument();
  });

  it("keeps unsaved edits and the same view across the read-only preview", async () => {
    const user = userEvent.setup();
    await mount();
    await user.click(screen.getByRole("button", { name: "Bold" }));
    await user.keyboard("{Control>}3{/Control}");
    expect(screen.getByRole("document", { name: "Preview" })).toBeInTheDocument();
    await user.keyboard("{Control>}1{/Control}");
    expect(screen.getByTestId("editor").querySelector(".cm-content")?.textContent).toContain(
      "****",
    );
  });

  it("keeps the desktop sidebar in place when Mod-\\ is pressed", async () => {
    const user = userEvent.setup();
    await mount();
    await user.keyboard("{Control>}\\{/Control}");
    expect(sidebarOpen()).toBe(false);
    expect(screen.getByRole("complementary", { name: "Sidebar" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Sidebar" })).toBeNull();
  });

  it("opens and shuts the sidebar drawer with Mod-\\ on narrow screens", async () => {
    narrowViewport();
    const user = userEvent.setup();
    await mount();
    expect(screen.queryByRole("complementary", { name: "Sidebar" })).toBeNull();
    await user.keyboard("{Control>}\\{/Control}");
    expect(sidebarOpen()).toBe(true);
    expect(await screen.findByRole("dialog", { name: "Sidebar" })).toBeInTheDocument();
    await user.keyboard("{Control>}\\{/Control}");
    expect(sidebarOpen()).toBe(false);
    expect(screen.queryByRole("dialog", { name: "Sidebar" })).toBeNull();
  });

  it("names the browser tab after the active document", async () => {
    const user = userEvent.setup();
    await mount();
    expect(document.title).toBe(`${title()} · emdy`);
    flush(() => setTitle("Project Kickoff Notes"));
    expect(document.title).toBe("Project Kickoff Notes · emdy");
    const other = documents().find((doc) => doc.id !== activeDocumentId())!;
    await user.click(screen.getByRole("button", { name: other.title }));
    expect(document.title).toBe(`${other.title} · emdy`);
    await user.keyboard("{Control>},{/Control}");
    expect(document.title).toBe("Settings · emdy");
    await user.keyboard("{Escape}");
    expect(document.title).toBe(`${other.title} · emdy`);
    for (const { id } of documents()) flush(() => deleteDocument(id));
    expect(document.title).toBe("emdy · Private Markdown editor that runs in your browser");
  });

  it("jumps to document search with Mod-P from focus mode", async () => {
    const user = userEvent.setup();
    await mount();
    flush(() => setFocusMode(true));
    expect(screen.queryByRole("searchbox", { name: "Search documents" })).toBeNull();
    await user.keyboard("{Control>}p{/Control}");
    expect(focusMode()).toBe(false);
    expect(sidebarOpen()).toBe(false);
    const search = await screen.findByRole("searchbox", { name: "Search documents" });
    await waitFor(() => expect(search).toHaveFocus());
  });

  it("creates a document with Mod-Alt-N from settings and the shortcuts panel", async () => {
    const user = userEvent.setup();
    await mount();
    const before = documents().length;
    await user.keyboard("{Control>},{/Control}");
    expect(view()).toBe("settings");
    await user.keyboard("{Control>}/{/Control}");
    expect(shortcutsOpen()).toBe(true);
    await user.keyboard("{Control>}{Alt>}n{/Alt}{/Control}");
    expect(documents()).toHaveLength(before + 1);
    expect(view()).toBe("document");
    expect(shortcutsOpen()).toBe(false);
    expect(activeDocumentId()).toBe(documents().at(-1)!.id);
    const editor = await screen.findByRole("textbox", { name: "Markdown editor" });
    await waitFor(() => expect(editor).toHaveFocus());
  });

  it("saves straight away with Mod-S instead of waiting for the debounce", async () => {
    const user = userEvent.setup();
    await mount();
    const saved = () =>
      Object.values(libraryDirectory.files()).some((text) => text.includes("Saved on demand"));
    flush(() => setDocText("# Heading\n\nSaved on demand"));
    expect(saved()).toBe(false);
    const started = Date.now();
    await user.keyboard("{Control>}s{/Control}");
    await waitFor(() => expect(saved()).toBe(true), { timeout: 400 });
    expect(Date.now() - started).toBeLessThan(500);
  });

  it("runs commands sent from the desktop menu", async () => {
    const bridge = createMemoryBridge(null);
    host[DESKTOP_BRIDGE_KEY] = bridge;
    const result = await mount();
    const before = documents().length;

    flush(() => bridge.sendCommand("layout-reader"));
    flush();
    expect(layoutMode()).toBe("reader");
    flush(() => bridge.sendCommand("shortcuts"));
    flush();
    expect(shortcutsOpen()).toBe(true);
    flush(() => bridge.sendCommand("new-document"));
    flush();
    expect(documents()).toHaveLength(before + 1);
    expect(shortcutsOpen()).toBe(false);
    flush(() => bridge.sendCommand("settings"));
    flush();
    expect(view()).toBe("settings");

    flush(() => bridge.sendCommand("bold"));
    flush(() => bridge.sendCommand("not-a-command"));
    flush();
    expect(documents()).toHaveLength(before + 1);

    result.unmount();
    flush(() => bridge.sendCommand("new-document"));
    flush();
    expect(documents()).toHaveLength(before + 1);
  });

  it("creates a document with Mod-N in the desktop app", async () => {
    host[DESKTOP_BRIDGE_KEY] = createMemoryBridge(null);
    const user = userEvent.setup();
    await mount();
    const before = documents().length;
    await user.keyboard("{Control>}{Alt>}n{/Alt}{/Control}");
    expect(documents()).toHaveLength(before);
    await user.keyboard("{Control>}n{/Control}");
    expect(documents()).toHaveLength(before + 1);
  });

  it("creates the first document with Mod-Alt-N from the welcome sheet", async () => {
    const user = userEvent.setup();
    await boot(false);
    render(() => <AppShell />);
    await screen.findByTestId("empty-library");
    await user.keyboard("{Control>}{Alt>}n{/Alt}{/Control}");
    expect(documents()).toHaveLength(1);
    expect(await screen.findByRole("textbox", { name: "Markdown editor" })).toBeInTheDocument();
  });

  it("closes the shortcuts panel and keeps focus on search after Mod-P", async () => {
    const user = userEvent.setup();
    await mount();
    await user.keyboard("{Control>}/{/Control}");
    expect(await screen.findByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();
    await user.keyboard("{Control>}p{/Control}");
    expect(shortcutsOpen()).toBe(false);
    const search = screen.getByRole("searchbox", { name: "Search documents" });
    await waitFor(() => expect(search).toHaveFocus());
    await Promise.resolve();
    expect(search).toHaveFocus();
  });

  it("enters focus mode with Mod-Shift-F and hides chrome, then exits on Escape", async () => {
    const user = userEvent.setup();
    await mount();
    await user.keyboard("{Control>}{Shift>}F{/Shift}{/Control}");
    expect(focusMode()).toBe(true);
    expect(screen.queryByText("emdy")).toBeNull();
    expect(screen.queryByRole("complementary", { name: "Sidebar" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Outline" })).toBeNull();
    expect(screen.queryByTestId("status-words")).toBeNull();
    expect(screen.queryByRole("group", { name: "Text formatting" })).toBeNull();
    expect(screen.getByTestId("editor-pane")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Exit focus mode" }));
    expect(focusMode()).toBe(false);
    expect(screen.queryByRole("button", { name: "Exit focus mode" })).toBeNull();
    expect(screen.getByText("emdy")).toBeInTheDocument();
    await user.keyboard("{Control>}{Shift>}F{/Shift}{/Control}");
    expect(focusMode()).toBe(true);
    await user.keyboard("{Escape}");
    expect(focusMode()).toBe(false);
  });

  it("starts the render worker once idle, so export works after going offline", async () => {
    vi.mocked(getRenderClient).mockClear();
    await mount();
    expect(layoutMode()).toBe("editor");
    await vi.waitFor(() => expect(getRenderClient).toHaveBeenCalled());
  });

  it("lets Escape close an open @ or / menu without leaving focus mode", async () => {
    const user = userEvent.setup();
    await mount();
    await user.keyboard("{Control>}{Shift>}F{/Shift}{/Control}");
    expect(focusMode()).toBe(true);
    const editor = await screen.findByRole("textbox", { name: "Markdown editor" });
    const menu = document.createElement("div");
    menu.className = "cm-tooltip cm-tooltip-autocomplete";
    editor.closest(".cm-editor")?.append(menu);
    editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    flush();
    expect(focusMode()).toBe(true);
    menu.remove();
    editor.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    flush();
    expect(focusMode()).toBe(false);
  });

  it("advertises only registered shortcuts, with tooltips that match", async () => {
    const mac = isMacPlatform();
    await mount();
    const registered = new Map(
      SHORTCUTS.map((shortcut) => [
        ariaKeyShortcuts(keysFor(shortcut), mac),
        formatShortcut(keysFor(shortcut), mac),
      ]),
    );
    const hints = new Set(registered.values());
    const check = () => {
      const advertised = [...document.querySelectorAll<HTMLElement>("[aria-keyshortcuts]")];
      expect(advertised.length).toBeGreaterThan(0);
      for (const element of advertised) {
        const aria = element.getAttribute("aria-keyshortcuts") ?? "";
        expect(registered.has(aria), aria).toBe(true);
        const title = element.getAttribute("title");
        if (title) expect(title.endsWith(`(${registered.get(aria)})`), title).toBe(true);
      }
      for (const element of document.querySelectorAll<HTMLElement>("[title]")) {
        const hint = /\(([^()]+)\)$/.exec(element.title)?.[1];
        if (hint && hints.has(hint)) expect(element).toHaveAttribute("aria-keyshortcuts");
      }
    };
    check();
    flush(() => setSidebarOpen(false));
    check();
    flush(() => setFocusMode(true));
    const exit = screen.getByRole("button", { name: "Exit focus mode" });
    expect(exit).toHaveAttribute("title", "Exit focus mode (Esc)");
    expect(exit).toHaveAttribute("aria-keyshortcuts", "Escape");
    check();
  });

  it("formats the document from the toolbar", async () => {
    const user = userEvent.setup();
    await mount();
    expect(screen.getByRole("group", { name: "Text formatting" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Bold" }));
    expect(screen.getByTestId("editor").querySelector(".cm-content")?.textContent).toContain(
      "****",
    );
  });

  it("opens and closes the shortcuts panel with Mod-/ and Escape", async () => {
    const user = userEvent.setup();
    await mount();
    await user.keyboard("{Control>}/{/Control}");
    expect(shortcutsOpen()).toBe(true);
    expect(await screen.findByRole("dialog", { name: "Keyboard shortcuts" })).toBeInTheDocument();
    setFocusMode(true);
    await user.keyboard("{Escape}");
    expect(shortcutsOpen()).toBe(false);
    expect(focusMode()).toBe(true);
  });

  it("opens settings with Mod-, and returns to the document on Escape", async () => {
    const user = userEvent.setup();
    await mount();
    const id = activeDocumentId();
    const before = documentLocation();
    await user.keyboard("{Control>},{/Control}");
    expect(view()).toBe("settings");
    expect(await screen.findByTestId("settings-page")).toBeInTheDocument();
    expect(window.location.hash).toBe("#/settings");
    expect(window.location.pathname).toBe("/");
    expect(screen.queryByRole("textbox", { name: "Markdown editor" })).toBeNull();
    expect(screen.getByRole("radiogroup", { name: "Theme" })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(view()).toBe("document");
    expect(await screen.findByRole("textbox", { name: "Markdown editor" })).toBeInTheDocument();
    expect(documentLocation()).toBe(before);
    expect(activeDocumentId()).toBe(id);
  });

  it("opens settings from the sidebar and returns with the back button", async () => {
    const user = userEvent.setup();
    await mount();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(await screen.findByTestId("settings-page")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Settings", level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("storage-location")).toHaveTextContent("This browser");
    await user.click(screen.getByRole("button", { name: "Back to document" }));
    expect(await screen.findByRole("textbox", { name: "Markdown editor" })).toBeInTheDocument();
    expect(window.location.hash).toMatch(/^#\/d\//);
  });

  it("shows the settings page when the initial URL names it", async () => {
    window.history.replaceState(null, "", "/#/settings");
    render(() => <AppShell />);
    expect(await screen.findByTestId("settings-page")).toBeInTheDocument();
    expect(view()).toBe("settings");
    expect(window.location.hash).toBe("#/settings");
  });

  it("applies the resolved theme to the document element", async () => {
    await mount();
    expect(document.documentElement.dataset.theme).toBe("light");
    flush(() => setThemePreference("dark"));
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("holds CSS transitions until the library has opened", async () => {
    const root = document.documentElement;
    resetLibraryState();
    render(() => <AppShell />);
    expect(root.hasAttribute("data-no-transitions")).toBe(true);
    await screen.findByRole("textbox", { name: "Markdown editor" });
    await waitFor(() => expect(root.hasAttribute("data-no-transitions")).toBe(false));
  });

  it("paints the chosen theme palette for the resolved appearance", async () => {
    const sage = BUILT_IN_THEMES.find((theme) => theme.id === "sage")!;
    const root = document.documentElement;
    await mount();
    expect(root.style.getPropertyValue("--color-canvas")).toBe(DEFAULT_THEME.light.canvas);
    flush(() => selectTheme("sage"));
    expect(root.style.getPropertyValue("--color-canvas")).toBe(sage.light.canvas);
    expect(root.style.getPropertyValue("--color-syntax-type")).toBe(sage.light["syntax-type"]);
    flush(() => setThemePreference("dark"));
    expect(root.style.getPropertyValue("--color-accent")).toBe(sage.dark.accent);
  });

  it("previews a theme draft and drops it when settings close", async () => {
    const tide = BUILT_IN_THEMES.find((theme) => theme.id === "tide")!;
    const user = userEvent.setup();
    const root = document.documentElement;
    await mount();
    await user.keyboard("{Control>},{/Control}");
    await screen.findByTestId("settings-page");
    flush(() => beginThemeDraft({ source: tide, name: "Draft" }));
    expect(root.style.getPropertyValue("--color-canvas")).toBe(tide.light.canvas);
    flush(() => setDraftAppearance("dark"));
    expect(root.dataset.theme).toBe("dark");
    expect(root.style.getPropertyValue("--color-canvas")).toBe(tide.dark.canvas);
    await user.keyboard("{Escape}");
    expect(view()).toBe("document");
    flush();
    expect(themeDraft()).toBeNull();
    expect(root.dataset.theme).toBe("light");
    expect(root.style.getPropertyValue("--color-canvas")).toBe(DEFAULT_THEME.light.canvas);
  });
});
