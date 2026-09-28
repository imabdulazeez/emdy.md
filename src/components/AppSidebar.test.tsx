import { fireEvent, render, screen, within } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { flush } from "solid-js";
import { TEST_DOCUMENTS } from "~/test-documents";
import { COLLAPSE_FALLBACK_MS, COLLAPSE_MS, REDUCED_MOTION_QUERY } from "~/lib/motion";
import {
  activeDocumentId,
  addDocuments,
  deleteDocument,
  docText,
  documents,
  loadDocuments,
  replaceDocument,
  resetDocumentState,
  saveDocumentText,
  setDocumentIcon,
  title,
} from "~/state/document";
import { registerEditorApi, resetEditorApiState } from "~/state/editor-api";
import { layoutMode, resetLayoutState, setLayoutMode } from "~/state/layout";
import { resetLibraryState } from "~/state/library";
import { resetThemeState, setThemePreference, themePreference } from "~/state/theme";
import { resetNavigationState, view } from "~/state/navigation";
import {
  requestSearch,
  resetUiState,
  searchRequested,
  setSidebarOpen,
  shortcutsOpen,
  sidebarOpen,
  editorFocusRequested,
} from "~/state/ui";
import { automaticDocumentIcon } from "~/lib/document-icon";
import AppSidebar from "./AppSidebar";
import { SidebarProvider, SidebarTrigger } from "./ui/sidebar";

vi.mock("~/state/document", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/state/document")>();
  return { ...actual, deleteDocument: vi.fn(actual.deleteDocument) };
});

vi.mock("~/lib/document-icon", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/document-icon")>();
  return { ...actual, automaticDocumentIcon: vi.fn(actual.automaticDocumentIcon) };
});

const originalMatchMedia = window.matchMedia;

beforeEach(() => resetDocumentState(TEST_DOCUMENTS));

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  resetNavigationState();
  window.history.replaceState(null, "", "/");
  resetLibraryState();
  resetLayoutState();
  resetThemeState();
  resetUiState();
  resetDocumentState(TEST_DOCUMENTS);
  resetEditorApiState();
});

function mount() {
  return render(() => (
    <SidebarProvider open={sidebarOpen()} onOpenChange={setSidebarOpen}>
      <AppSidebar />
    </SidebarProvider>
  ));
}

const documentList = () => screen.getByRole("list", { name: "Documents" });
const groupNames = () =>
  Array.from(documentList().querySelectorAll("[data-sidebar=group-label]"), (label) =>
    label.textContent?.trim(),
  );

const namesInGroup = (group: string) =>
  within(screen.getByRole("list", { name: group }))
    .getAllByRole("button")
    .filter((button) => button.dataset.sidebar === "menu-button")
    .map((button) => button.getAttribute("aria-label"));

const daysAgo = (days: number) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return date.getTime();
};

const documentNames = () =>
  within(documentList())
    .getAllByRole("button")
    .filter((button) => button.dataset.sidebar === "menu-button")
    .map((button) => button.getAttribute("aria-label") ?? button.textContent);

describe("AppSidebar", () => {
  it("renders brand, the document list, and footer controls", () => {
    mount();
    expect(screen.getByRole("complementary", { name: "Sidebar" })).toBeInTheDocument();
    expect(screen.getByText("emdy.md")).toBeInTheDocument();
    expect(screen.getByText("emdy.md").parentElement?.querySelector("svg[data-logo]")).toHaveClass(
      "size-6",
    );
    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
    expect(screen.queryByText("Documents")).toBeNull();
    expect(screen.getByText("emdy.md").parentElement).toContainElement(
      screen.getByRole("button", { name: "New document" }),
    );
    expect(screen.getByRole("group", { name: "Theme" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keyboard shortcuts" })).toBeInTheDocument();
    expect(screen.getByText("emdy.md").parentElement).toContainElement(
      screen.getByRole("button", { name: "Settings" }),
    );
    expect(screen.queryByRole("button", { name: "Import documents" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Export all documents" })).toBeNull();
    expect(screen.queryByText("Mode")).toBeNull();
    expect(screen.queryByRole("button", { name: /Raw Markdown/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Focus mode/ })).toBeNull();
  });

  it("shows the title beside a generated icon for each document", () => {
    mount();
    for (const doc of TEST_DOCUMENTS) {
      const button = screen.getByRole("button", { name: doc.title });
      const label = button.querySelector(":scope > span:not([data-document-icon])");
      expect(label?.textContent).toMatch(
        new RegExp(`^${doc.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
      );
      const icon = button.querySelector("[data-document-icon]");
      expect(icon).toHaveAttribute("data-document-icon", "automatic");
      expect(icon).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("keeps the document icon visible when collapsed to icons", () => {
    mount();
    const active = screen.getByRole("button", { name: TEST_DOCUMENTS[0].title });
    expect(active.querySelector("[data-icon=file]")).toBeNull();
    expect(active).toHaveClass(
      "group-data-[collapsible=icon]:[&>:not(svg):not([data-document-icon])]:hidden",
    );
    expect(active.querySelector("[data-document-icon] text")?.textContent).toMatch(/^[A-Z]{2}$/);
  });

  it("lists every document with the active one marked", () => {
    mount();
    expect(documentNames()).toEqual(TEST_DOCUMENTS.map((doc) => doc.title));
    const active = screen.getByRole("button", { name: TEST_DOCUMENTS[0].title });
    expect(active).toHaveAttribute("aria-current", "page");
    expect(active).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("button", { name: TEST_DOCUMENTS[1].title })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("keeps every document under one Today heading while they are all fresh", () => {
    mount();
    expect(groupNames()).toEqual(["Today"]);
    expect(namesInGroup("Today")).toEqual(TEST_DOCUMENTS.map((doc) => doc.title));
  });

  it("separates documents by when they were last written", () => {
    flush(() =>
      loadDocuments([
        { id: "aaa111", title: "Fresh", text: "", modified: daysAgo(0) },
        { id: "bbb222", title: "Sleep on it", text: "", modified: daysAgo(1) },
        { id: "ccc333", title: "Midweek", text: "", modified: daysAgo(3) },
        { id: "ddd444", title: "Last edge", text: "", modified: daysAgo(7) },
        { id: "eee555", title: "Ancient", text: "", modified: daysAgo(20) },
        { id: "fff666", title: "Forgotten", text: "", modified: daysAgo(400) },
      ]),
    );
    mount();
    expect(groupNames()).toEqual(["Today", "Yesterday", "Last 7 days", "Last 30 days", "Older"]);
    expect(namesInGroup("Today")).toEqual(["Fresh"]);
    expect(namesInGroup("Yesterday")).toEqual(["Sleep on it"]);
    expect(namesInGroup("Last 7 days")).toEqual(["Midweek", "Last edge"]);
    expect(namesInGroup("Last 30 days")).toEqual(["Ancient"]);
    expect(namesInGroup("Older")).toEqual(["Forgotten"]);
    expect(documentNames()).toEqual([
      "Fresh",
      "Sleep on it",
      "Midweek",
      "Last edge",
      "Ancient",
      "Forgotten",
    ]);
  });

  it("moves a document to Today when it is edited and drops empty groups", () => {
    flush(() =>
      loadDocuments([
        { id: "aaa111", title: "Fresh", text: "", modified: daysAgo(0) },
        { id: "fff666", title: "Forgotten", text: "", modified: daysAgo(400) },
      ]),
    );
    mount();
    expect(namesInGroup("Older")).toEqual(["Forgotten"]);
    vi.useFakeTimers({ toFake: ["Date"], now: daysAgo(0) + 1000 });
    flush(() => saveDocumentText("fff666", "written again"));
    vi.useRealTimers();
    expect(groupNames()).toEqual(["Today"]);
    expect(namesInGroup("Today")).toEqual(["Forgotten", "Fresh"]);
  });

  it("neither re-renders nor recomputes rows when an edit changes only the text", async () => {
    flush(() =>
      loadDocuments([
        { id: "aaa111", title: "Fresh", text: "first", modified: daysAgo(0) },
        { id: "bbb222", title: "Second", text: "second", modified: daysAgo(0) - 1000 },
      ]),
    );
    mount();
    const row = screen.getByRole("button", { name: "Fresh" });
    const mutations: MutationRecord[] = [];
    const observer = new MutationObserver((records) => mutations.push(...records));
    observer.observe(documentList(), {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    vi.mocked(automaticDocumentIcon).mockClear();
    vi.useFakeTimers({ toFake: ["Date"], now: daysAgo(0) + 1000 });
    flush(() => saveDocumentText("aaa111", "first, then more"));
    flush(() => saveDocumentText("aaa111", "first, then more still"));
    vi.useRealTimers();
    await Promise.resolve();
    observer.disconnect();
    expect(mutations).toEqual([]);
    expect(automaticDocumentIcon).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Fresh" })).toBe(row);
  });

  it("updates a row when its title or icon changes", () => {
    flush(() =>
      loadDocuments([{ id: "aaa111", title: "Fresh", text: "first", modified: daysAgo(0) }]),
    );
    mount();
    flush(() => replaceDocument("aaa111", "Renamed", "first"));
    expect(screen.getByRole("button", { name: "Renamed" })).toBeInTheDocument();
    flush(() => setDocumentIcon("aaa111", { kind: "emoji", emoji: "🌱" }));
    expect(screen.getByRole("button", { name: "Renamed" })).toHaveTextContent("🌱");
  });

  describe("search", () => {
    const searchBox = () => screen.getByRole("searchbox", { name: "Search documents" });

    beforeEach(() => {
      flush(() =>
        loadDocuments([
          { id: "aaa111", title: "Weekly sync", text: "Agenda for the week", modified: daysAgo(0) },
          {
            id: "bbb222",
            title: "Reading list",
            text: "Books to finish this week.\nThen the rest.",
            modified: daysAgo(2),
          },
          {
            id: "ccc333",
            title: "Project ideas",
            text: "A markdown editor",
            modified: daysAgo(40),
          },
        ]),
      );
    });

    it("shows matching titles and content excerpts in place of the date groups", async () => {
      const user = userEvent.setup();
      mount();
      await user.type(searchBox(), "WEEK");
      expect(screen.queryByRole("list", { name: "Documents" })).toBeNull();
      expect(screen.getByRole("list", { name: "Search results" })).toBeInTheDocument();
      expect(namesInGroup("Titles")).toEqual(["Weekly sync"]);
      expect(namesInGroup("Contents")).toEqual(["Reading list"]);
      const excerpt = screen
        .getByRole("button", { name: "Reading list" })
        .querySelector("[data-excerpt]");
      expect(excerpt).toHaveTextContent("Books to finish this week. Then the rest.");
      expect(excerpt?.querySelector("mark")?.textContent).toMatch(/^week$/);
    });

    it("reports when nothing matches and restores the groups when cleared", async () => {
      const user = userEvent.setup();
      mount();
      await user.type(searchBox(), "zebra");
      expect(screen.getByRole("status")).toHaveTextContent("No documents match “zebra”.");
      await user.click(screen.getByRole("button", { name: "Clear search" }));
      expect(searchBox()).toHaveValue("");
      expect(screen.queryByRole("status")).toBeNull();
      expect(groupNames()).toEqual(["Today", "Last 7 days", "Older"]);
    });

    it("ignores a query of only whitespace", async () => {
      const user = userEvent.setup();
      mount();
      await user.type(searchBox(), "   ");
      expect(screen.getByRole("list", { name: "Documents" })).toBeInTheDocument();
      expect(screen.queryByRole("list", { name: "Search results" })).toBeNull();
    });

    it("clears with Escape, then leaves the field on a second Escape", async () => {
      const user = userEvent.setup();
      mount();
      await user.type(searchBox(), "ideas");
      await user.keyboard("{Escape}");
      expect(searchBox()).toHaveValue("");
      expect(searchBox()).toHaveFocus();
      await user.keyboard("{Escape}");
      expect(searchBox()).not.toHaveFocus();
    });

    it("opens the first result with Enter and keeps the query", async () => {
      const user = userEvent.setup();
      mount();
      await user.type(searchBox(), "markdown{Enter}");
      expect(activeDocumentId()).toBe("ccc333");
      expect(searchBox()).toHaveValue("markdown");
      expect(screen.getByRole("button", { name: "Project ideas" })).toHaveAttribute(
        "aria-current",
        "page",
      );
    });

    it("leaves Enter to the IME while composing", async () => {
      const user = userEvent.setup();
      mount();
      const before = activeDocumentId();
      await user.type(searchBox(), "sync");
      fireEvent.keyDown(searchBox(), { key: "Enter", isComposing: true });
      expect(activeDocumentId()).toBe(before);
      expect(activeDocumentId()).not.toBe("aaa111");
      expect(searchBox()).toHaveValue("sync");
    });

    it("updates results as documents change", async () => {
      const user = userEvent.setup();
      mount();
      await user.type(searchBox(), "zebra");
      flush(() => saveDocumentText("ccc333", "A zebra crossing"));
      expect(namesInGroup("Contents")).toEqual(["Project ideas"]);
    });

    it("deletes a document from the results", async () => {
      const user = userEvent.setup();
      mount();
      await user.type(searchBox(), "week");
      await user.click(screen.getByRole("button", { name: "Delete Reading list" }));
      await user.click(screen.getByRole("button", { name: "Delete" }));
      expect(documents().some((doc) => doc.id === "bbb222")).toBe(false);
      expect(screen.queryByRole("list", { name: "Contents" })).toBeNull();
    });

    it("clears the search when a new document is created", async () => {
      const user = userEvent.setup();
      mount();
      await user.type(searchBox(), "zebra");
      await user.click(screen.getByRole("button", { name: "New document" }));
      expect(searchBox()).toHaveValue("");
      expect(namesInGroup("Today")).toContain("Untitled");
    });

    it("focuses and selects the search field when search is requested", async () => {
      const user = userEvent.setup();
      mount();
      await user.type(searchBox(), "week");
      searchBox().blur();
      flush(requestSearch);
      await Promise.resolve();
      const input = searchBox() as HTMLInputElement;
      expect(input).toHaveFocus();
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe(4);
      expect(searchRequested()).toBe(false);
    });

    it("advertises the search shortcut", () => {
      mount();
      expect(searchBox()).toHaveAttribute("aria-keyshortcuts", "Control+P");
      expect(searchBox()).toHaveAttribute("title", "Search documents (Ctrl+P)");
    });

    it("holds a search request until the sidebar expands", async () => {
      flush(() => setSidebarOpen(false));
      mount();
      flush(requestSearch);
      await Promise.resolve();
      expect(screen.queryByRole("searchbox")).toBeNull();
      expect(searchRequested()).toBe(true);
      flush(() => setSidebarOpen(true));
      await Promise.resolve();
      expect(searchBox()).toHaveFocus();
      expect(searchRequested()).toBe(false);
    });

    it("focuses search inside the mobile overlay instead of its first control", async () => {
      window.matchMedia = (query) => {
        const media = originalMatchMedia(query);
        Object.defineProperty(media, "matches", { value: true });
        return media;
      };
      flush(() => setSidebarOpen(false));
      mount();
      await Promise.resolve();
      flush();
      flush(() => {
        setSidebarOpen(true);
        requestSearch();
      });
      await screen.findByRole("dialog", { name: "Sidebar" });
      await Promise.resolve();
      await Promise.resolve();
      expect(searchBox()).toHaveFocus();
    });

    it("hides the search field and results while collapsed to icons", async () => {
      const user = userEvent.setup();
      mount();
      await user.type(searchBox(), "week");
      flush(() => setSidebarOpen(false));
      expect(screen.queryByRole("searchbox")).toBeNull();
      expect(screen.getByRole("list", { name: "Documents" })).toBeInTheDocument();
    });
  });

  it("opens a document and focuses the editor", async () => {
    const user = userEvent.setup();
    const editor = {
      scrollToLine: vi.fn(),
      focus: vi.fn(),
      getText: () => "",
      flush: vi.fn(),
      runCommand: vi.fn(),
      applyEdits: vi.fn(),
    };
    flush(() => registerEditorApi(editor));
    mount();
    const target = documents()[2];
    await user.click(screen.getByRole("button", { name: target.title }));
    expect(activeDocumentId()).toBe(target.id);
    expect(docText()).toBe(target.text);
    expect(title()).toBe(target.title);
    expect(editor.focus).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: target.title })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("hands focus onward after opening a document on mobile", async () => {
    window.matchMedia = (query) => {
      const media = originalMatchMedia(query);
      Object.defineProperty(media, "matches", { value: true });
      return media;
    };
    const user = userEvent.setup();
    flush(() => setSidebarOpen(false));
    render(() => (
      <SidebarProvider open={sidebarOpen()} onOpenChange={setSidebarOpen}>
        <AppSidebar />
        <SidebarTrigger />
        <textarea aria-label="Editor" />
      </SidebarProvider>
    ));
    const editor = screen.getByRole("textbox", { name: "Editor" });
    flush(() =>
      registerEditorApi({
        scrollToLine: vi.fn(),
        focus: () => editor.focus(),
        getText: () => "",
        flush: vi.fn(),
        runCommand: vi.fn(),
        applyEdits: vi.fn(),
      }),
    );
    const target = documents()[1];
    await user.click(screen.getByRole("button", { name: "Show sidebar" }));
    await screen.findByRole("dialog", { name: "Sidebar" });
    await user.click(screen.getByRole("button", { name: target.title }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(title()).toBe(target.title);
    expect(editor).toHaveFocus();
    await user.keyboard("Ready to edit");
    expect(editor).toHaveValue("Ready to edit");
  });

  it("creates a new document and selects it", async () => {
    const user = userEvent.setup();
    mount();
    vi.useFakeTimers({ toFake: ["Date"], now: Date.now() + 1000 });
    await user.click(screen.getByRole("button", { name: "New document" }));
    vi.useRealTimers();
    expect(documents()).toHaveLength(TEST_DOCUMENTS.length + 1);
    expect(title()).toBe("Untitled");
    expect(docText()).toBe("");
    expect(documentNames()[0]).toBe("Untitled");
    expect(editorFocusRequested()).toBe(true);
    expect(screen.getByRole("button", { name: "Untitled" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("asks for confirmation before deleting and can cancel", async () => {
    const user = userEvent.setup();
    mount();
    const target = documents()[1];
    await user.click(screen.getByRole("button", { name: `Delete ${target.title}` }));
    const prompt = screen.getByRole("group", { name: `Delete ${target.title}?` });
    expect(prompt).toBeInTheDocument();
    await Promise.resolve();
    expect(within(prompt).getByRole("button", { name: "Delete" })).toHaveFocus();
    expect(screen.queryByRole("button", { name: target.title })).toBeNull();

    await user.click(within(prompt).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("group", { name: `Delete ${target.title}?` })).toBeNull();
    expect(screen.getByRole("button", { name: target.title })).toBeInTheDocument();
    expect(documents()).toHaveLength(TEST_DOCUMENTS.length);

    await user.click(screen.getByRole("button", { name: `Delete ${target.title}` }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("group", { name: `Delete ${target.title}?` })).toBeNull();
    expect(documents()).toHaveLength(TEST_DOCUMENTS.length);
  });

  it("deletes a document after confirmation", async () => {
    const user = userEvent.setup();
    mount();
    const target = documents()[1];
    await user.click(screen.getByRole("button", { name: `Delete ${target.title}` }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(documents().some((doc) => doc.id === target.id)).toBe(false);
    expect(screen.queryByRole("button", { name: target.title })).toBeNull();
    expect(documentNames()).toHaveLength(TEST_DOCUMENTS.length - 1);
    expect(activeDocumentId()).toBe(documents()[0].id);
  });

  it("moves to a neighbour when the active document is deleted", async () => {
    const user = userEvent.setup();
    mount();
    const [first, second] = documents();
    await user.click(screen.getByRole("button", { name: `Delete ${first.title}` }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(activeDocumentId()).toBe(second.id);
    expect(docText()).toBe(second.text);
    expect(screen.getByRole("button", { name: second.title })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("opens the shortcuts panel", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Keyboard shortcuts" }));
    expect(shortcutsOpen()).toBe(true);
  });

  it("opens settings from a header button beside the new document button", async () => {
    const user = userEvent.setup();
    mount();
    const settings = screen.getByRole("button", { name: "Settings" });
    const create = screen.getByRole("button", { name: "New document" });
    expect(screen.queryByRole("button", { name: "Library and settings" })).toBeNull();
    expect(
      settings.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(settings).toHaveAttribute("title", expect.stringMatching(/^Settings \((⌘,|Ctrl\+,)\)$/));
    expect(settings).toHaveAttribute(
      "aria-keyshortcuts",
      expect.stringMatching(/^(Meta|Control)\+,$/),
    );
    expect(settings).not.toHaveAttribute("aria-current");
    await user.click(settings);
    expect(view()).toBe("settings");
    expect(settings).toHaveAttribute("aria-current", "page");
    expect(settings).toHaveAttribute("data-active", "true");
  });

  it("leaves settings when a document is opened from the sidebar", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(view()).toBe("settings");
    const target = documents()[2];
    await user.click(screen.getByRole("button", { name: target.title }));
    expect(view()).toBe("document");
    expect(activeDocumentId()).toBe(target.id);
    expect(window.location.hash).not.toContain("settings");
  });

  it("leaves settings when the active document is clicked", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    const active = activeDocumentId();
    const item = screen.getByRole("button", { name: title() });
    await user.click(item);
    expect(view()).toBe("document");
    expect(activeDocumentId()).toBe(active);
    expect(item).toHaveAttribute("aria-current", "page");
  });

  it("does not highlight the active document while settings is open", async () => {
    const user = userEvent.setup();
    mount();
    const item = screen.getByRole("button", { name: title() });
    expect(item).toHaveAttribute("aria-current", "page");
    await user.click(screen.getByRole("button", { name: "Settings" }));
    expect(item).not.toHaveAttribute("aria-current");
    expect(item).not.toHaveAttribute("data-active", "true");
    expect(documentList().querySelector("[aria-current]")).toBeNull();
  });

  it("leaves Read-only preview when a new document is created", async () => {
    const user = userEvent.setup();
    flush(() => setLayoutMode("reader"));
    mount();
    await user.click(screen.getByRole("button", { name: "New document" }));
    expect(title()).toBe("Untitled");
    expect(layoutMode()).toBe("editor");
    expect(editorFocusRequested()).toBe(true);
  });

  it("leaves settings when a new document is created", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    await user.click(screen.getByRole("button", { name: "New document" }));
    expect(view()).toBe("document");
    expect(title()).toBe("Untitled");
  });

  it("collapses to icon buttons for shortcuts and theme when closed", async () => {
    const user = userEvent.setup();
    mount();
    flush(() => setSidebarOpen(false));
    expect(screen.queryByRole("group", { name: "Theme" })).toBeNull();
    const [header, settings] = screen.getAllByRole("button", { name: "Settings" });
    expect(header).toHaveClass("group-data-[collapsible=icon]:hidden");
    expect(settings).toHaveAttribute("title", expect.stringMatching(/^Settings \((⌘,|Ctrl\+,)\)$/));
    expect(settings).toHaveAttribute(
      "aria-keyshortcuts",
      expect.stringMatching(/^(Meta|Control)\+,$/),
    );
    expect(screen.queryByRole("button", { name: "Import documents" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Export all documents" })).toBeNull();
    const shortcuts = screen.getByRole("button", { name: "Keyboard shortcuts" });
    expect(shortcuts).toHaveAttribute(
      "title",
      expect.stringMatching(/^Keyboard shortcuts \((⌘\/|Ctrl\+\/)\)$/),
    );
    expect(shortcuts).toHaveAttribute(
      "aria-keyshortcuts",
      expect.stringMatching(/^(Meta|Control)\+\/$/),
    );
    const cycle = screen.getByRole("button", { name: "Theme: System. Switch theme" });
    expect(cycle).toHaveAttribute("title", "Theme: System");
    await user.click(cycle);
    expect(themePreference()).toBe("light");
    flush(() => setThemePreference("dark"));
    expect(screen.getByRole("button", { name: "Theme: Dark. Switch theme" })).toBeInTheDocument();
  });
});

describe("AppSidebar context menus", () => {
  const rightClick = (user: ReturnType<typeof userEvent.setup>, target: Element) =>
    user.pointer({ keys: "[MouseRight]", target });

  const menuItems = () => screen.getAllByRole("menuitem").map((item) => item.textContent);

  it("offers icon and delete actions for a document on right-click", async () => {
    const user = userEvent.setup();
    mount();
    const target = TEST_DOCUMENTS[1];
    await rightClick(user, screen.getByRole("button", { name: target.title }));
    expect(await screen.findByRole("menu", { name: target.title })).toBeInTheDocument();
    expect(menuItems()).toEqual(["Change icon…", "Delete…"]);
    expect(screen.getByRole("menuitem", { name: "Delete…" })).toHaveAttribute(
      "data-danger",
      "true",
    );
  });

  it("closes the icon picker and focuses search when search is requested", async () => {
    const user = userEvent.setup();
    mount();
    await rightClick(user, screen.getByRole("button", { name: TEST_DOCUMENTS[1].title }));
    await user.click(await screen.findByRole("menuitem", { name: "Change icon…" }));
    expect(await screen.findByRole("dialog", { name: "Document icon" })).toBeInTheDocument();
    flush(requestSearch);
    await Promise.resolve();
    expect(screen.queryByRole("dialog", { name: "Document icon" })).toBeNull();
    expect(screen.getByRole("searchbox", { name: "Search documents" })).toHaveFocus();
  });

  it("closes an open context menu when search is requested", async () => {
    const user = userEvent.setup();
    mount();
    await rightClick(user, screen.getByRole("button", { name: TEST_DOCUMENTS[1].title }));
    expect(await screen.findByRole("menu")).toBeInTheDocument();
    flush(requestSearch);
    await Promise.resolve();
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("searchbox", { name: "Search documents" })).toHaveFocus();
  });

  it("changes a document's icon through the picker and can return it to automatic", async () => {
    const user = userEvent.setup();
    mount();
    const target = TEST_DOCUMENTS[1];
    const button = () => screen.getByRole("button", { name: target.title });
    await rightClick(user, button());
    await user.click(await screen.findByRole("menuitem", { name: "Change icon…" }));
    const dialog = await screen.findByRole("dialog", { name: "Document icon" });
    expect(within(dialog).getByText(target.title)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("radio", { name: "Emoji" }));
    await user.click(within(dialog).getByRole("button", { name: "Books" }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(documents().find((doc) => doc.id === target.id)?.icon).toEqual({
      kind: "emoji",
      emoji: "📚",
    });
    const icon = button().querySelector("[data-document-icon]");
    expect(icon).toHaveAttribute("data-document-icon", "emoji");
    expect(icon).toHaveTextContent("📚");
    await vi.waitFor(() => expect(button()).toHaveFocus());

    await rightClick(user, button());
    expect(menuItems()).toEqual(["Change icon…", "Use automatic icon", "Delete…"]);
    await user.click(screen.getByRole("menuitem", { name: "Use automatic icon" }));
    expect(documents().find((doc) => doc.id === target.id)?.icon).toBeNull();
    expect(button().querySelector("[data-document-icon]")).toHaveAttribute(
      "data-document-icon",
      "automatic",
    );
  });

  it("starts the inline delete confirmation from the menu", async () => {
    const user = userEvent.setup();
    mount();
    const target = TEST_DOCUMENTS[1];
    await rightClick(user, screen.getByRole("button", { name: target.title }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete…" }));
    const confirm = screen.getByRole("group", { name: `Delete ${target.title}?` });
    await vi.waitFor(() =>
      expect(within(confirm).getByRole("button", { name: "Delete" })).toHaveFocus(),
    );
  });

  it("leaves delete out of the menu while collapsed to icons", async () => {
    const user = userEvent.setup();
    mount();
    flush(() => setSidebarOpen(false));
    await rightClick(user, screen.getByRole("button", { name: TEST_DOCUMENTS[1].title }));
    await screen.findByRole("menu");
    expect(menuItems()).toEqual(["Change icon…"]);
  });

  it("offers a new document when right-clicking the empty list area", async () => {
    const user = userEvent.setup();
    mount();
    const content = screen
      .getByRole("navigation", { name: "Main" })
      .closest<HTMLElement>("[data-sidebar=content]")!;
    await rightClick(user, content);
    expect(await screen.findByRole("menu", { name: "Library" })).toBeInTheDocument();
    expect(menuItems()).toEqual(["New document"]);
    await user.click(screen.getByRole("menuitem", { name: "New document" }));
    expect(documents()).toHaveLength(TEST_DOCUMENTS.length + 1);
    expect(title()).toBe("Untitled");
  });

  it("opens the document menu from the keyboard and returns focus on Escape", async () => {
    const user = userEvent.setup();
    mount();
    const button = screen.getByRole("button", { name: TEST_DOCUMENTS[2].title });
    button.focus();
    await user.keyboard("{Shift>}{F10}{/Shift}");
    await vi.waitFor(() =>
      expect(screen.getByRole("menuitem", { name: "Change icon…" })).toHaveFocus(),
    );
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(button).toHaveFocus();
  });

  it("does not stack the library menu under a document menu", async () => {
    const user = userEvent.setup();
    mount();
    await rightClick(user, screen.getByRole("button", { name: TEST_DOCUMENTS[0].title }));
    expect(screen.getAllByRole("menu")).toHaveLength(1);
    expect(screen.getByRole("menu")).toHaveAccessibleName(TEST_DOCUMENTS[0].title);
  });
});

describe("AppSidebar deletion motion", () => {
  interface FakeAnimation {
    element: Element;
    finish(): void;
    cancelled: boolean;
  }

  let animations: FakeAnimation[];

  beforeEach(() => {
    animations = [];
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      writable: true,
      value(this: HTMLElement) {
        let finish!: () => void;
        const finished = new Promise<Animation>((resolve) => {
          finish = () => resolve(this as unknown as Animation);
        });
        const record: FakeAnimation = { element: this, finish, cancelled: false };
        animations.push(record);
        return {
          finished,
          cancel: () => (record.cancelled = true),
        } as unknown as Animation;
      },
    });
    vi.mocked(deleteDocument).mockClear();
  });

  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, "animate");
    vi.useRealTimers();
  });

  const prompt = (title: string) => screen.getByRole("group", { name: `Delete ${title}?` });
  const rowOf = (element: Element) => element.closest("[data-document-row]");

  async function confirmWithMouse(user: ReturnType<typeof userEvent.setup>, title: string) {
    await user.click(screen.getByRole("button", { name: `Delete ${title}` }));
    await user.click(within(prompt(title)).getByRole("button", { name: "Delete" }));
  }

  async function confirmWithKeyboard(user: ReturnType<typeof userEvent.setup>, title: string) {
    screen.getByRole("button", { name: title }).focus();
    await user.keyboard("{Shift>}{F10}{/Shift}");
    await vi.waitFor(() =>
      expect(screen.getByRole("menuitem", { name: "Change icon…" })).toHaveFocus(),
    );
    await user.keyboard("{End}{Enter}");
    await vi.waitFor(() =>
      expect(within(prompt(title)).getByRole("button", { name: "Delete" })).toHaveFocus(),
    );
    await user.keyboard("{Enter}");
  }

  it("collapses the confirmed row, then commits the deletion and navigates", async () => {
    const user = userEvent.setup();
    mount();
    const [first, second] = documents();
    await confirmWithMouse(user, first.title);

    const row = rowOf(prompt(first.title))!;
    expect(row).toHaveAttribute("data-removing");
    expect(row).toHaveAttribute("inert");
    expect(animations.map((animation) => animation.element)).toEqual([row]);
    expect(deleteDocument).not.toHaveBeenCalled();
    expect(documents().some((doc) => doc.id === first.id)).toBe(true);
    expect(activeDocumentId()).toBe(first.id);
    expect(screen.getByRole("button", { name: second.title })).toHaveFocus();

    animations[0].finish();
    await vi.waitFor(() => expect(row).not.toBeInTheDocument());
    expect(deleteDocument).toHaveBeenCalledExactlyOnceWith(first.id);
    expect(documents().some((doc) => doc.id === first.id)).toBe(false);
    expect(documentNames()).toEqual(TEST_DOCUMENTS.slice(1).map((doc) => doc.title));
    expect(activeDocumentId()).toBe(second.id);
    expect(screen.getByRole("button", { name: second.title })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("button", { name: second.title })).toHaveFocus();
  });

  it("ignores a second confirmation while the row collapses", async () => {
    const user = userEvent.setup();
    mount();
    const target = TEST_DOCUMENTS[1];
    await confirmWithMouse(user, target.title);
    fireEvent.click(within(prompt(target.title)).getByRole("button", { name: "Delete" }));
    fireEvent.click(within(prompt(target.title)).getByRole("button", { name: "Delete" }));
    expect(animations).toHaveLength(1);

    animations[0].finish();
    await vi.waitFor(() => expect(deleteDocument).toHaveBeenCalled());
    await Promise.resolve();
    expect(deleteDocument).toHaveBeenCalledOnce();
    expect(documents()).toHaveLength(TEST_DOCUMENTS.length - 1);
  });

  it("commits after a fallback timeout when the animation never finishes", async () => {
    vi.useFakeTimers();
    mount();
    const target = TEST_DOCUMENTS[2];
    fireEvent.click(screen.getByRole("button", { name: `Delete ${target.title}` }));
    flush();
    fireEvent.click(within(prompt(target.title)).getByRole("button", { name: "Delete" }));
    flush();
    expect(rowOf(prompt(target.title))).toHaveAttribute("data-removing");

    await vi.advanceTimersByTimeAsync(COLLAPSE_MS + COLLAPSE_FALLBACK_MS - 1);
    expect(deleteDocument).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(deleteDocument).toHaveBeenCalledExactlyOnceWith(target.id);
    flush();
    expect(screen.queryByRole("group", { name: `Delete ${target.title}?` })).toBeNull();
    expect(screen.queryByRole("button", { name: target.title })).toBeNull();
  });

  it("removes the row at once when the user prefers reduced motion", async () => {
    window.matchMedia = ((query: string) =>
      ({
        matches: query === REDUCED_MOTION_QUERY,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList) as typeof window.matchMedia;
    const user = userEvent.setup();
    mount();
    const [, target, next] = TEST_DOCUMENTS;
    await confirmWithMouse(user, target.title);
    expect(animations).toHaveLength(0);
    expect(deleteDocument).toHaveBeenCalledExactlyOnceWith(target.id);
    expect(screen.queryByRole("group", { name: `Delete ${target.title}?` })).toBeNull();
    expect(screen.queryByRole("button", { name: target.title })).toBeNull();
    expect(screen.getByRole("button", { name: next.title })).toHaveFocus();
  });

  it("moves keyboard focus to the next row, or the previous one at the end", async () => {
    const user = userEvent.setup();
    mount();
    const [, second, third, last] = TEST_DOCUMENTS;
    await confirmWithKeyboard(user, second.title);
    expect(screen.getByRole("button", { name: third.title })).toHaveFocus();
    animations[0].finish();
    await vi.waitFor(() => expect(deleteDocument).toHaveBeenCalledWith(second.id));

    await confirmWithKeyboard(user, last.title);
    expect(screen.getByRole("button", { name: third.title })).toHaveFocus();
    animations[1].finish();
    await vi.waitFor(() => expect(deleteDocument).toHaveBeenCalledWith(last.id));
    expect(screen.getByRole("button", { name: third.title })).toHaveFocus();
  });

  it("skips collapsing rows for focus and commits overlapping deletions together", async () => {
    const user = userEvent.setup();
    mount();
    const [first, second, third] = TEST_DOCUMENTS;
    await confirmWithMouse(user, second.title);
    await confirmWithMouse(user, first.title);
    expect(animations).toHaveLength(2);
    expect(screen.getByRole("button", { name: third.title })).toHaveFocus();

    // Both collapses end in the same tick; neither deletion may undo the other.
    for (const animation of animations) animation.finish();
    await vi.waitFor(() => expect(deleteDocument).toHaveBeenCalledTimes(2));
    expect(documents().map((doc) => doc.title)).toEqual(
      TEST_DOCUMENTS.slice(2).map((doc) => doc.title),
    );
    expect(activeDocumentId()).toBe(third.id);
  });

  it("hands focus to New document when the last document goes", async () => {
    flush(() => loadDocuments([{ id: "aaa111", title: "Only one", text: "" }]));
    const user = userEvent.setup();
    mount();
    await confirmWithKeyboard(user, "Only one");
    expect(screen.getByRole("button", { name: "New document" })).toHaveFocus();
    animations[0].finish();
    await vi.waitFor(() => expect(documents()).toHaveLength(0));
    expect(screen.getByRole("button", { name: "New document" })).toHaveFocus();
  });

  it("collapses the whole section when its last row is deleted", async () => {
    flush(() =>
      loadDocuments([
        { id: "aaa111", title: "Fresh", text: "", modified: daysAgo(0) },
        { id: "bbb222", title: "Sleep on it", text: "", modified: daysAgo(1) },
        { id: "ccc333", title: "Forgotten", text: "", modified: daysAgo(400) },
      ]),
    );
    const user = userEvent.setup();
    mount();
    await confirmWithMouse(user, "Sleep on it");
    const [{ element }] = animations;
    expect(element.tagName).toBe("LI");
    expect(element).not.toHaveAttribute("data-document-row");
    expect(element).toContainElement(screen.getByText("Yesterday"));
    expect(screen.getByRole("button", { name: "Forgotten" })).toHaveFocus();

    animations[0].finish();
    await vi.waitFor(() => expect(groupNames()).toEqual(["Today", "Older"]));
    expect(animations[0].cancelled).toBe(false);
  });

  it("restores a collapsing section that gains a document before the deletion lands", async () => {
    flush(() =>
      loadDocuments([
        { id: "aaa111", title: "Fresh", text: "", modified: daysAgo(0) },
        { id: "bbb222", title: "Sleep on it", text: "", modified: daysAgo(1) },
      ]),
    );
    const user = userEvent.setup();
    mount();
    await confirmWithMouse(user, "Sleep on it");
    const [{ element: section }] = animations;
    expect(section).toContainElement(screen.getByText("Yesterday"));
    flush(() => addDocuments([{ id: "ccc333", title: "Arrived", text: "", modified: daysAgo(1) }]));

    animations[0].finish();
    await vi.waitFor(() => expect(deleteDocument).toHaveBeenCalledWith("bbb222"));
    expect(namesInGroup("Yesterday")).toEqual(["Arrived"]);
    expect(screen.queryByRole("group", { name: "Delete Sleep on it?" })).toBeNull();
    expect(section).toBeInTheDocument();
    expect(animations[0].cancelled).toBe(true);
    expect((section as HTMLElement).style.overflow).toBe("");
  });

  it("still commits confirmed deletions if the sidebar unmounts mid-collapse", async () => {
    const user = userEvent.setup();
    const { unmount } = mount();
    const [, second, third] = TEST_DOCUMENTS;
    await confirmWithMouse(user, second.title);
    await confirmWithMouse(user, third.title);
    unmount();
    await vi.waitFor(() => expect(deleteDocument).toHaveBeenCalledTimes(2));
    expect(documents().map((doc) => doc.id)).toEqual(
      TEST_DOCUMENTS.filter((doc) => doc !== second && doc !== third).map((doc) => doc.id),
    );
    for (const animation of animations) animation.finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(deleteDocument).toHaveBeenCalledTimes(2);
  });
});
