import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { TEST_DOCUMENTS } from "~/test-documents";
import { createRoot, flush } from "solid-js";
import { documentHref, documentPath } from "~/lib/route";
import { resetCursorState, setCursor } from "./cursor";
import {
  activeDocumentId,
  createDocument,
  deleteDocument,
  documents,
  findDocument,
  openDocument,
  resetDocumentState,
  setTitle,
  updateDocumentText,
} from "./document";
import { registerEditorApi, resetEditorApiState } from "./editor-api";
import { resetLayoutState, setLayoutMode } from "./layout";
import {
  activeHeading,
  closeSettings,
  currentDocumentHref,
  currentDocumentPath,
  openSettings,
  pendingHeading,
  readingLine,
  resetNavigationState,
  restoredLine,
  startHistorySync,
  syncLocation,
  toggleSettings,
  view,
} from "./navigation";
import { resetStatsState, setOutline } from "./stats";
import { anchorViewportLine, resetViewportState, setViewportLine } from "./viewport";
import { resetWorkspaceState, savePosition } from "./workspace";

let stop: (() => void) | undefined;

const HEADINGS = [
  { level: 1, text: "Intro", line: 1 },
  { level: 2, text: "Why local-first?", line: 5 },
  { level: 2, text: "Code", line: 12 },
  { level: 2, text: "Code", line: 20 },
];

beforeEach(() => resetDocumentState(TEST_DOCUMENTS));

afterEach(() => {
  stop?.();
  stop = undefined;
  resetDocumentState(TEST_DOCUMENTS);
  resetStatsState();
  resetViewportState();
  resetCursorState();
  resetEditorApiState();
  resetLayoutState();
  resetNavigationState();
  resetWorkspaceState();
  window.history.replaceState(null, "", "/");
});

const start = () => {
  stop = createRoot((dispose) => {
    startHistorySync(window);
    return dispose;
  });
  flush();
};

const location = () =>
  `${window.location.pathname}${window.location.search}${window.location.hash}`;

function registerApis() {
  const editor = {
    scrollToLine: vi.fn(),
    focus: vi.fn(),
    getText: () => "",
    flush: vi.fn(),
    runCommand: vi.fn(),
    applyEdits: vi.fn(),
  };
  flush(() => registerEditorApi(editor));
  return { editor };
}

describe("navigation", () => {
  it("builds the route and href for a document id", () => {
    const [first] = documents();
    expect(currentDocumentPath(first.id)).toBe(documentPath(first));
    expect(currentDocumentPath("zzzzzz")).toBe("/d/zzzzzz");
    expect(currentDocumentPath("zzzzzz", "intro")).toBe("/d/zzzzzz/intro");
    expect(currentDocumentHref(first.id)).toBe(documentHref(first));
    expect(currentDocumentHref("zzzzzz", { search: "?q=1", heading: "intro" })).toBe(
      "/?q=1#/d/zzzzzz/intro",
    );
  });

  it("opens the document named by the initial URL and corrects a stale slug", () => {
    const target = documents()[1];
    window.history.replaceState(null, "", `/?q=1#/d/old-name-${target.id}`);
    const length = window.history.length;
    start();
    expect(activeDocumentId()).toBe(target.id);
    expect(location()).toBe(documentHref(target, { search: "?q=1" }));
    expect(window.history.length).toBe(length);
  });

  it.each([
    "/missing",
    "/nested/path",
    "/#missing",
    "/#/d/",
    "/#/d/zzzzzz",
    "/#/d/a/b",
    "/#/d/zzzzzz/intro",
  ])("replaces an unknown URL %s with the active document", (url) => {
    window.history.replaceState(null, "", url);
    const id = activeDocumentId();
    const length = window.history.length;
    start();
    expect(activeDocumentId()).toBe(id);
    expect(location()).toBe(currentDocumentHref(id));
    expect(pendingHeading()).toBeNull();
    expect(window.history.length).toBe(length);
  });

  it("keeps the pathname at / so the host never sees document details", () => {
    start();
    const [, second] = documents();
    flush(() => openDocument(second.id));
    flush(() => setTitle("Private Journal"));
    flush(() => createDocument("Secret Plans"));
    flush(() => setOutline(HEADINGS, activeDocumentId()));
    flush(() => setViewportLine(6));
    expect(window.location.pathname).toBe("/");
    expect(window.location.hash).toBe(`#/d/secret-plans-${activeDocumentId()}/why-local-first`);
  });

  it("pushes an entry when the active document changes and replaces on rename", () => {
    start();
    const [first, second] = documents();
    const length = window.history.length;
    flush(() => openDocument(second.id));
    expect(location()).toBe(documentHref(second));
    expect(window.history.length).toBe(length + 1);
    flush(() => setTitle("Project Kickoff Notes"));
    expect(location()).toBe(`/#/d/project-kickoff-notes-${second.id}`);
    expect(window.history.length).toBe(length + 1);
    flush(() => openDocument(first.id));
    expect(location()).toBe(documentHref(first));
    expect(window.history.length).toBe(length + 2);
  });

  it("follows creation and deletion", () => {
    start();
    flush(() => createDocument());
    const id = activeDocumentId();
    expect(location()).toBe(currentDocumentHref(id));
    flush(() => deleteDocument(id));
    expect(location()).toBe(currentDocumentHref(activeDocumentId()));
  });

  it("reopens documents on popstate and hashchange", () => {
    start();
    const [first, second] = documents();
    window.history.replaceState(null, "", documentHref(second));
    window.dispatchEvent(new PopStateEvent("popstate"));
    flush();
    expect(activeDocumentId()).toBe(second.id);
    window.history.replaceState(null, "", `/#/d/renamed-${first.id}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    flush();
    expect(activeDocumentId()).toBe(first.id);
    expect(location()).toBe(documentHref(first));
  });

  it("stops listening once disposed", () => {
    start();
    const [first, second] = documents();
    stop?.();
    stop = undefined;
    window.history.replaceState(null, "", documentHref(second));
    window.dispatchEvent(new PopStateEvent("popstate"));
    flush();
    expect(activeDocumentId()).toBe(first.id);
    flush(() => openDocument(second.id));
    expect(location()).toBe(documentHref(second));
    expect(findDocument(second.id)).toBeDefined();
  });

  it("shows the settings view for its URL without rewriting it", () => {
    window.history.replaceState(null, "", "/#/settings");
    const length = window.history.length;
    start();
    expect(view()).toBe("settings");
    expect(location()).toBe("/#/settings");
    expect(window.history.length).toBe(length);
    window.history.replaceState(null, "", "/#/settings/");
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    flush();
    expect(view()).toBe("settings");
  });

  it("pushes a settings entry and returns to the document on close", () => {
    start();
    const [first, second] = documents();
    const length = window.history.length;
    flush(() => openSettings(window));
    expect(view()).toBe("settings");
    expect(location()).toBe("/#/settings");
    expect(window.history.length).toBe(length + 1);
    flush(() => openSettings(window));
    expect(window.history.length).toBe(length + 1);
    flush(() => openDocument(second.id));
    expect(location()).toBe("/#/settings");
    flush(() => closeSettings(window));
    expect(view()).toBe("document");
    expect(location()).toBe(documentHref(second));
    expect(window.history.length).toBe(length + 1);
    flush(() => closeSettings(window));
    expect(location()).toBe(documentHref(second));
    flush(() => openDocument(first.id));
    expect(location()).toBe(documentHref(first));
  });

  it("toggles settings and follows history back out of them", () => {
    start();
    const [first] = documents();
    flush(() => toggleSettings(window));
    expect(view()).toBe("settings");
    flush(() => toggleSettings(window));
    expect(view()).toBe("document");
    expect(location()).toBe(documentHref(first));
    flush(() => openSettings(window));
    window.history.replaceState(null, "", documentHref(first));
    window.dispatchEvent(new PopStateEvent("popstate"));
    flush();
    expect(view()).toBe("document");
  });

  it("syncLocation is idempotent for a correct URL", () => {
    const [first] = documents();
    window.history.replaceState(null, "", documentHref(first));
    const length = window.history.length;
    syncLocation(window);
    flush();
    expect(location()).toBe(documentHref(first));
    expect(window.history.length).toBe(length);
  });
});

describe("reading position", () => {
  it("prefers the viewport line and falls back to the cursor", () => {
    flush(() => setCursor({ line: 8, column: 1 }));
    expect(readingLine()).toBe(8);
    flush(() => setViewportLine(3));
    expect(readingLine()).toBe(3);
  });

  it("resolves the active heading only from the active document's outline", () => {
    const [first, second] = documents();
    flush(() => setViewportLine(6));
    expect(activeHeading()).toBeNull();
    flush(() => setOutline(HEADINGS, second.id));
    expect(activeHeading()).toBeNull();
    flush(() => setOutline(HEADINGS, first.id));
    expect(activeHeading()).toBe("why-local-first");
    flush(() => setViewportLine(25));
    expect(activeHeading()).toBe("code-2");
    flush(() => setOutline([{ level: 1, text: "Later", line: 30 }], first.id));
    expect(activeHeading()).toBeNull();
  });
});

describe("heading routes", () => {
  it("appends the heading as the view reaches it and replaces instead of pushing", () => {
    start();
    const [first] = documents();
    const length = window.history.length;
    flush(() => setOutline(HEADINGS, first.id));
    flush(() => setViewportLine(1));
    expect(location()).toBe(documentHref(first, { heading: "intro" }));
    flush(() => setViewportLine(7));
    expect(location()).toBe(documentHref(first, { heading: "why-local-first" }));
    flush(() => setViewportLine(21));
    expect(location()).toBe(documentHref(first, { heading: "code-2" }));
    expect(window.history.length).toBe(length);
  });

  it("names the heading a jump anchors on, before the view reports its position", () => {
    start();
    const [first] = documents();
    flush(() => setOutline(HEADINGS, first.id));
    flush(() => setViewportLine(1));
    expect(location()).toBe(documentHref(first, { heading: "intro" }));
    flush(() => anchorViewportLine(20));
    expect(readingLine()).toBe(20);
    expect(location()).toBe(documentHref(first, { heading: "code-2" }));
    flush(() => setViewportLine(18));
    expect(location()).toBe(documentHref(first, { heading: "code-2" }));
    flush(() => setViewportLine(6));
    expect(location()).toBe(documentHref(first, { heading: "why-local-first" }));
  });

  it("follows the cursor when the viewport line is unknown", () => {
    start();
    const [first] = documents();
    flush(() => setOutline(HEADINGS, first.id));
    flush(() => setCursor({ line: 13, column: 1 }));
    expect(location()).toBe(documentHref(first, { heading: "code" }));
  });

  it("ignores an outline published for another document", () => {
    start();
    const [first, second] = documents();
    flush(() => setOutline(HEADINGS, second.id));
    flush(() => setViewportLine(7));
    expect(location()).toBe(documentHref(first));
    flush(() => openDocument(second.id));
    expect(location()).toBe(documentHref(second, { heading: "why-local-first" }));
  });

  it("scrolls the editor to the heading named by the initial URL once the outline arrives", () => {
    const [first] = documents();
    window.history.replaceState(null, "", `/?q=1#/d/stale-${first.id}/code-2`);
    const length = window.history.length;
    start();
    expect(location()).toBe(documentHref(first, { search: "?q=1", heading: "code-2" }));
    expect(pendingHeading()).toEqual({ id: first.id, heading: "code-2" });
    const { editor } = registerApis();
    expect(editor.scrollToLine).not.toHaveBeenCalled();
    flush(() => setOutline(HEADINGS, first.id));
    expect(editor.scrollToLine).toHaveBeenCalledWith(20);
    expect(pendingHeading()).toBeNull();
    expect(readingLine()).toBe(20);
    expect(location()).toBe(documentHref(first, { search: "?q=1", heading: "code-2" }));
    expect(window.history.length).toBe(length);
  });

  it("keeps a restored reading position that already sits inside the requested section", () => {
    const [first] = documents();
    flush(() => savePosition(first.id, { line: 14 }));
    window.history.replaceState(null, "", documentHref(first, { heading: "code" }));
    start();
    const { editor } = registerApis();
    flush(() => setOutline(HEADINGS, first.id));
    expect(editor.scrollToLine).not.toHaveBeenCalled();
    expect(pendingHeading()).toBeNull();
    flush(() => setViewportLine(14));
    expect(location()).toBe(documentHref(first, { heading: "code" }));
  });

  it("falls back to the saved cursor line when no reading line was recorded", () => {
    const [first] = documents();
    const text = Array.from({ length: 25 }, (_, index) => `line ${index + 1}`).join("\n");
    flush(() => updateDocumentText(first.id, text));
    flush(() =>
      savePosition(first.id, { anchor: text.indexOf("line 14"), head: text.indexOf("line 14") }),
    );
    expect(restoredLine(first.id)).toBe(14);
    window.history.replaceState(null, "", documentHref(first, { heading: "code" }));
    start();
    const { editor } = registerApis();
    flush(() => setOutline(HEADINGS, first.id));
    expect(editor.scrollToLine).not.toHaveBeenCalled();
    expect(pendingHeading()).toBeNull();
    expect(restoredLine("nope00")).toBe(0);
  });

  it("still jumps when the restored position is in a different section", () => {
    const [first] = documents();
    flush(() => savePosition(first.id, { line: 14 }));
    window.history.replaceState(null, "", documentHref(first, { heading: "code-2" }));
    start();
    const { editor } = registerApis();
    flush(() => setOutline(HEADINGS, first.id));
    expect(editor.scrollToLine).toHaveBeenCalledWith(20);
  });

  it("waits for the editor api before scrolling", () => {
    const [first] = documents();
    window.history.replaceState(null, "", documentHref(first, { heading: "code" }));
    start();
    flush(() => setOutline(HEADINGS, first.id));
    expect(pendingHeading()).not.toBeNull();
    const { editor } = registerApis();
    expect(editor.scrollToLine).toHaveBeenCalledWith(12);
    expect(pendingHeading()).toBeNull();
  });

  it("scrolls the same view to the heading when reading", () => {
    const [first] = documents();
    flush(() => setLayoutMode("reader"));
    window.history.replaceState(null, "", documentHref(first, { heading: "intro" }));
    start();
    const { editor } = registerApis();
    flush(() => setOutline(HEADINGS, first.id));
    expect(editor.scrollToLine).toHaveBeenCalledWith(1);
  });

  it("drops an unknown heading once the outline is known", () => {
    const [first] = documents();
    window.history.replaceState(null, "", documentHref(first, { heading: "missing" }));
    start();
    const { editor } = registerApis();
    expect(location()).toBe(documentHref(first, { heading: "missing" }));
    flush(() => setOutline(HEADINGS, first.id));
    expect(editor.scrollToLine).not.toHaveBeenCalled();
    expect(pendingHeading()).toBeNull();
    expect(location()).toBe(documentHref(first, { heading: "intro" }));
    flush(() => setViewportLine(5));
    expect(location()).toBe(documentHref(first, { heading: "why-local-first" }));
  });

  it("drops a pending heading when the user opens another document first", () => {
    const [first, second] = documents();
    window.history.replaceState(null, "", documentHref(first, { heading: "code" }));
    start();
    const { editor } = registerApis();
    flush(() => openDocument(second.id));
    expect(pendingHeading()).toBeNull();
    flush(() => setOutline(HEADINGS, second.id));
    expect(editor.scrollToLine).not.toHaveBeenCalled();
    expect(location()).toBe(documentHref(second, { heading: "intro" }));
  });

  it("jumps to a heading when the fragment changes within the same document", () => {
    start();
    const [first] = documents();
    const { editor } = registerApis();
    flush(() => setOutline(HEADINGS, first.id));
    window.history.replaceState(null, "", documentHref(first, { heading: "why-local-first" }));
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    flush();
    expect(editor.scrollToLine).toHaveBeenCalledWith(5);
    expect(activeDocumentId()).toBe(first.id);
  });

  it("restores the heading of a history entry on popstate", () => {
    start();
    const [first, second] = documents();
    const { editor } = registerApis();
    flush(() => setOutline(HEADINGS, first.id));
    flush(() => setViewportLine(12));
    flush(() => openDocument(second.id));
    flush(() => setOutline([], second.id));
    window.history.replaceState(null, "", documentHref(first, { heading: "code" }));
    window.dispatchEvent(new PopStateEvent("popstate"));
    flush();
    expect(activeDocumentId()).toBe(first.id);
    expect(pendingHeading()).toEqual({ id: first.id, heading: "code" });
    flush(() => setOutline(HEADINGS, first.id));
    expect(editor.scrollToLine).toHaveBeenCalledWith(12);
    expect(pendingHeading()).toBeNull();
  });
});
