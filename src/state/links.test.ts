import { flush } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { TextEdit } from "~/lib/markdown/document-links";
import {
  activeDocumentId,
  createDocument,
  findDocument,
  openDocument,
  resetDocumentState,
} from "./document";
import { registerEditorApi, resetEditorApiState } from "./editor-api";
import {
  documentFile,
  followLink,
  followRenamedFiles,
  mentionSource,
  resetLinkState,
  resolveDocumentFile,
  useLinkCatalog,
  type LinkCatalogEntry,
} from "./links";

const DOCUMENTS = [
  { id: "notes1", title: "Meeting notes", text: "# Meeting notes\n\n## Agenda" },
  { id: "plan01", title: "Plan", text: "See [Meeting notes](Meeting%20notes.md#agenda)." },
  { id: "draft1", title: "Draft", text: "[the notes](<Meeting notes.md>) and [Plan](Plan.md)" },
];

let entries: Map<string, LinkCatalogEntry>;

function catalogWith(files: Record<string, [file: string, title: string]>) {
  entries = new Map(
    Object.entries(files).map(([id, [file, title]]) => [id, { id, file, title, created: 1_000 }]),
  );
  return { entry: (id: string) => entries.get(id), entries: () => entries.values() };
}

beforeEach(() => {
  flush(() => resetDocumentState(DOCUMENTS));
  useLinkCatalog(
    catalogWith({
      notes1: ["Meeting notes.md", "Meeting notes"],
      plan01: ["Plan.md", "Plan"],
      draft1: ["Draft.md", "Draft"],
    }),
  );
});

afterEach(() => {
  resetLinkState();
  resetEditorApiState();
  resetDocumentState();
  window.history.replaceState(null, "", "/");
});

describe("documentFile and resolveDocumentFile", () => {
  it("uses the file on disk, or the file an unsaved document will get", () => {
    expect(documentFile("notes1")).toBe("Meeting notes.md");
    const fresh = flush(() => createDocument("Ideas: Q4?"));
    expect(documentFile(fresh.id)).toBe("Ideas Q4.md");
  });

  it("finds a document by file, then by the file it will get, then by title", () => {
    expect(resolveDocumentFile("meeting NOTES.md")).toBe("notes1");
    const fresh = flush(() => createDocument("Ideas: Q4?"));
    expect(resolveDocumentFile("Ideas Q4.md")).toBe(fresh.id);
    entries.delete("plan01");
    expect(resolveDocumentFile("plan.md")).toBe("plan01");
    expect(resolveDocumentFile("Gone.md")).toBeNull();
  });
});

describe("followLink", () => {
  it("opens a linked document and heading through the URL fragment", () => {
    expect(followLink("Meeting%20notes.md#Agenda")).toBe(true);
    expect(window.location.pathname).toBe("/");
    expect(window.location.hash).toBe("#/d/meeting-notes-notes1/agenda");
  });

  it("opens a heading in the current document", () => {
    flush(() => openDocument("plan01"));
    expect(followLink("#next-steps")).toBe(true);
    expect(window.location.hash).toBe("#/d/plan-plan01/next-steps");
  });

  it("does nothing for links that name nothing in the library", () => {
    expect(followLink("Gone.md")).toBe(false);
    expect(followLink("image.png")).toBe(false);
    expect(followLink("https://example.com")).toBe(false);
    expect(window.location.hash).toBe("");
  });
});

describe("followRenamedFiles", () => {
  it("rewrites links in other documents and keeps a label the writer chose", () => {
    flush(() => openDocument("notes1"));
    entries.set("notes1", {
      id: "notes1",
      file: "Team sync.md",
      title: "Team sync",
      created: 1_000,
    });
    let renames: ReturnType<typeof followRenamedFiles> = [];
    flush(() => {
      renames = followRenamedFiles();
    });
    expect(renames).toEqual([
      {
        from: "Meeting notes.md",
        to: "Team sync.md",
        fromTitle: "Meeting notes",
        toTitle: "Team sync",
      },
    ]);
    expect(findDocument("plan01")?.text).toBe("See [Team sync](Team%20sync.md#agenda).");
    expect(findDocument("draft1")?.text).toBe("[the notes](<Team sync.md>) and [Plan](Plan.md)");
    flush(() => {
      renames = followRenamedFiles();
    });
    expect(renames).toEqual([]);
  });

  it("edits the open document through the editor so the cursor and history survive", () => {
    flush(() => openDocument("plan01"));
    const applyEdits = vi.fn<(edits: readonly TextEdit[]) => void>();
    flush(() =>
      registerEditorApi({
        scrollToLine: vi.fn(),
        focus: vi.fn(),
        getText: () => "Unsaved [Meeting notes](Meeting%20notes.md)",
        flush: vi.fn(),
        runCommand: vi.fn(),
        applyEdits,
      }),
    );
    entries.set("notes1", { id: "notes1", file: "Minutes.md", title: "Minutes", created: 1_000 });
    flush(() => followRenamedFiles());
    expect(applyEdits).toHaveBeenCalledWith([
      { from: 9, to: 22, insert: "Minutes" },
      { from: 24, to: 42, insert: "Minutes.md" },
    ]);
    expect(findDocument("plan01")?.text).toBe(DOCUMENTS[1].text);
  });

  it("takes documents saved for the first time as a baseline, not a rename", () => {
    const fresh = flush(() => createDocument("Later"));
    entries.set(fresh.id, { id: fresh.id, file: "Later.md", title: "Later", created: 2_000 });
    let renames: ReturnType<typeof followRenamedFiles> = [];
    flush(() => {
      renames = followRenamedFiles();
    });
    expect(renames).toEqual([]);
  });
});

describe("mentionSource", () => {
  it("offers every other document and the open document's values", () => {
    flush(() => openDocument("plan01"));
    expect(activeDocumentId()).toBe("plan01");
    expect(mentionSource.documents().map((doc) => doc.id)).toEqual(["notes1", "draft1"]);
    expect(mentionSource.linkTarget("notes1")).toBe("Meeting notes.md");
    expect(mentionSource.title()).toBe("Plan");
    expect(mentionSource.created()).toBe(1_000);
    expect(mentionSource.now()).toBeInstanceOf(Date);
    resetLinkState();
    expect(mentionSource.created()).toBeNull();
  });
});
