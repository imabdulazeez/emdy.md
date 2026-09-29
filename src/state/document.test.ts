import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { flush } from "solid-js";
import { SAMPLE_DOCUMENT, SAMPLE_TITLE, TEST_DOCUMENTS } from "~/test-documents";
import {
  DEFAULT_TITLE,
  EMPTY_DOCUMENT,
  activeDocument,
  activeDocumentId,
  activeRevision,
  addDocuments,
  clearDocumentState,
  createDocument,
  deleteDocument,
  docText,
  documents,
  findDocument,
  loadDocuments,
  normalizeTitle,
  openDocument,
  replaceDocument,
  resetDocumentState,
  sameListing,
  saveDocumentText,
  setDocText,
  setDocumentIcon,
  setTitle,
  title,
  titleIsAutomatic,
  toListing,
  updateDocumentText,
} from "./document";
import {
  documentPosition,
  documentPositions,
  lastDocumentId,
  pinDocument,
  pinnedDocumentIds,
  rememberDocument,
  resetWorkspaceState,
  savePosition,
} from "./workspace";

beforeEach(() => resetDocumentState(TEST_DOCUMENTS));

afterEach(() => {
  clearDocumentState();
  resetWorkspaceState();
});

const idPattern = /^[a-z0-9]{6}$/;

describe("document state", () => {
  it("keeps loaded ids stable and assigns unique ids to new documents", () => {
    const loadedIds = documents().map((doc) => doc.id);
    expect(loadedIds).toEqual(TEST_DOCUMENTS.map((doc) => doc.id));
    const ids = [...loadedIds];
    flush(() => createDocument("Same", "Same text"));
    ids.push(activeDocumentId());
    flush(() => createDocument("Same", "Same text"));
    ids.push(activeDocumentId());
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(idPattern);
    flush(() => resetDocumentState(TEST_DOCUMENTS));
    expect(documents().map((doc) => doc.id)).toEqual(loadedIds);
    flush(() => resetDocumentState());
    expect(documents()).toEqual([]);
    expect(activeDocumentId()).toBe("");
  });

  it("preserves a document id when editing, renaming, and switching", () => {
    const [first, second] = documents();
    flush(() => setTitle("Renamed"));
    flush(() => setDocText("Edited"));
    flush(() => openDocument(second.id));
    flush(() => openDocument(first.id));
    expect(findDocument(first.id)).toEqual({
      id: first.id,
      title: "Renamed",
      text: "Edited",
      revision: 1,
      modified: expect.any(Number),
      icon: null,
    });
    expect(activeDocumentId()).toBe(first.id);
  });

  it("starts with the first loaded document active and every document listed", () => {
    expect(docText()).toBe(SAMPLE_DOCUMENT);
    expect(title()).toBe(SAMPLE_TITLE);
    expect(activeDocument()).toBe(documents()[0]);
    expect(documents().map((doc) => doc.title)).toEqual(TEST_DOCUMENTS.map((doc) => doc.title));
    expect(activeDocumentId()).toBe(documents()[0].id);
    expect(new Set(documents().map((doc) => doc.id)).size).toBe(documents().length);
  });

  it("derives the active text and title from the record", () => {
    flush(() => setDocText("hello"));
    expect(docText()).toBe("hello");
    expect(findDocument(activeDocumentId())?.text).toBe("hello");
    expect(activeDocument().text).toBe("hello");
  });

  it("bumps the revision for replacements but not for editor snapshots", () => {
    const id = activeDocumentId();
    expect(activeRevision()).toBe(0);
    flush(() => saveDocumentText(id, "typed"));
    expect(docText()).toBe("typed");
    expect(activeRevision()).toBe(0);
    flush(() => updateDocumentText(id, "imported"));
    expect(docText()).toBe("imported");
    expect(activeRevision()).toBe(1);
    flush(() => updateDocumentText(id, "imported"));
    expect(activeRevision()).toBe(1);
    flush(() => saveDocumentText("missing", "ignored"));
    expect(documents()).toHaveLength(TEST_DOCUMENTS.length);
  });

  it("normalizes titles and derives a blank title from the text", () => {
    expect(normalizeTitle("  My   Doc ")).toBe("My Doc");
    expect(normalizeTitle("   ")).toBe(DEFAULT_TITLE);
    flush(() => setTitle("Custom"));
    flush(() => setTitle("  "));
    expect(title()).toBe("Welcome to emdy");
    flush(() => createDocument("Named"));
    flush(() => setTitle(""));
    expect(title()).toBe("Untitled");
    flush(() => setTitle("Notes"));
    expect(title()).toBe("Notes");
    expect(activeDocument().title).toBe("Notes");
  });

  it("opens another document and restores it on return", () => {
    const [first, second] = documents();
    flush(() => setDocText("edited first"));
    expect(openDocument(second.id)).toBe(true);
    flush();
    expect(activeDocumentId()).toBe(second.id);
    expect(docText()).toBe(second.text);
    expect(title()).toBe(second.title);
    flush(() => openDocument(first.id));
    expect(docText()).toBe("edited first");
    expect(openDocument("missing")).toBe(false);
  });

  it("updates a background document without touching the active text", () => {
    const [, second] = documents();
    flush(() => updateDocumentText(second.id, "later"));
    expect(docText()).toBe(SAMPLE_DOCUMENT);
    expect(findDocument(second.id)?.text).toBe("later");
    expect(findDocument(second.id)?.revision).toBe(1);
    flush(() => updateDocumentText(activeDocumentId(), "now"));
    expect(docText()).toBe("now");
    flush(() => updateDocumentText("missing", "ignored"));
    expect(documents()).toHaveLength(TEST_DOCUMENTS.length);
  });

  it("creates a new empty document and makes it active", () => {
    let created = { id: "", title: "", text: "", revision: 0 };
    flush(() => {
      created = createDocument();
    });
    expect(created.title).toBe(DEFAULT_TITLE);
    expect(documents().at(-1)?.id).toBe(created.id);
    expect(activeDocumentId()).toBe(created.id);
    expect(docText()).toBe("");
    flush(() => createDocument("  Draft  ", "# Draft"));
    expect(title()).toBe("Draft");
    expect(docText()).toBe("# Draft");
  });

  it("deletes a background document without changing the active one", () => {
    const [first, second] = documents();
    flush(() => deleteDocument(second.id));
    expect(documents().some((doc) => doc.id === second.id)).toBe(false);
    expect(activeDocumentId()).toBe(first.id);
    expect(deleteDocument("missing")).toBe(false);
  });

  it("opens the nearest neighbour when the active document is deleted", () => {
    const [first, second, third] = documents();
    flush(() => openDocument(second.id));
    flush(() => deleteDocument(second.id));
    expect(activeDocumentId()).toBe(third.id);
    expect(docText()).toBe(third.text);
    const last = documents().at(-1)!;
    flush(() => openDocument(last.id));
    flush(() => deleteDocument(last.id));
    expect(activeDocumentId()).toBe(documents().at(-1)!.id);
    expect(documents().some((doc) => doc.id === first.id)).toBe(true);
  });

  it("keeps every deletion made in the same tick", () => {
    const [first, second, third] = documents();
    flush(() => {
      deleteDocument(second.id);
      deleteDocument(third.id);
    });
    expect(documents().map((doc) => doc.id)).not.toContain(second.id);
    expect(documents().map((doc) => doc.id)).not.toContain(third.id);
    expect(documents().map((doc) => doc.id)).toContain(first.id);
    expect(activeDocumentId()).toBe(first.id);
  });

  it("follows the active document through deletions in the same tick", () => {
    const [first, second, third, fourth] = documents();
    flush(() => openDocument(second.id));
    flush(() => {
      deleteDocument(second.id);
      deleteDocument(third.id);
    });
    expect(documents().map((doc) => doc.id)).toEqual([first.id, fourth.id]);
    expect(activeDocumentId()).toBe(fourth.id);
    expect(lastDocumentId()).toBe(fourth.id);
  });

  it("remembers the active document as it changes", () => {
    const [first, second] = documents();
    flush(() => openDocument(second.id));
    expect(lastDocumentId()).toBe(second.id);
    flush(() => createDocument("New"));
    expect(lastDocumentId()).toBe(activeDocumentId());
    flush(() => deleteDocument(activeDocumentId()));
    expect(lastDocumentId()).toBe(activeDocumentId());
    flush(() => openDocument(first.id));
    expect(lastDocumentId()).toBe(first.id);
  });

  it("starts on the remembered document when it still exists", () => {
    const third = TEST_DOCUMENTS[2];
    flush(() => rememberDocument(third.id));
    flush(() => loadDocuments(TEST_DOCUMENTS));
    expect(activeDocumentId()).toBe(third.id);
    flush(() => rememberDocument("gone00"));
    flush(() => loadDocuments(TEST_DOCUMENTS));
    expect(activeDocumentId()).toBe(TEST_DOCUMENTS[0].id);
    expect(lastDocumentId()).toBe(TEST_DOCUMENTS[0].id);
  });

  it("drops saved positions for deleted and missing documents", () => {
    const [first, second] = documents();
    flush(() => savePosition(second.id, { line: 3 }));
    flush(() => deleteDocument(second.id));
    expect(documentPosition(second.id)).toBeUndefined();
    flush(() => savePosition(first.id, { line: 1 }));
    flush(() => savePosition("gone00", { line: 9 }));
    flush(() => loadDocuments(TEST_DOCUMENTS));
    expect(Object.keys(documentPositions())).toEqual([first.id]);
  });

  it("unpins deleted documents and prunes pins for missing ones on load", () => {
    const [first, second, third] = documents();
    flush(() => {
      pinDocument(first.id);
      pinDocument(second.id);
      pinDocument(third.id);
    });
    flush(() => deleteDocument(second.id));
    expect(pinnedDocumentIds()).toEqual([first.id, third.id]);
    flush(() => pinDocument("gone00"));
    flush(() => loadDocuments(TEST_DOCUMENTS));
    expect(pinnedDocumentIds()).toEqual([first.id, third.id]);
  });

  it("exposes an empty placeholder before anything is loaded", () => {
    flush(() => clearDocumentState());
    expect(documents()).toEqual([]);
    expect(activeDocument()).toBe(EMPTY_DOCUMENT);
    expect(docText()).toBe("");
    expect(title()).toBe("");
    expect(activeDocumentId()).toBe("");
    flush(() => setDocText("ignored"));
    flush(() => setTitle("ignored"));
    expect(documents()).toEqual([]);
    expect(lastDocumentId()).toBeNull();
  });

  it("loads a document list with fresh revisions and leaves nothing open when empty", () => {
    let loaded: { id: string; revision: number }[] = [];
    flush(() => {
      loaded = loadDocuments([{ id: "abc123", title: "A", text: "a" }]);
    });
    expect(loaded).toEqual([
      {
        id: "abc123",
        title: "A",
        text: "a",
        revision: 0,
        modified: expect.any(Number),
        icon: null,
      },
    ]);
    expect(documents()).toEqual(loaded);
    expect(activeDocumentId()).toBe("abc123");
    flush(() => loadDocuments([]));
    expect(documents()).toEqual([]);
    expect(activeDocument()).toBe(EMPTY_DOCUMENT);
    expect(activeDocumentId()).toBe("");
  });

  it("opens the first arriving document when nothing is open yet", () => {
    flush(() => clearDocumentState());
    flush(() =>
      addDocuments([
        { id: "arr001", title: "Arrived", text: "one" },
        { id: "arr002", title: "Later", text: "two" },
      ]),
    );
    expect(activeDocumentId()).toBe("arr001");
    expect(lastDocumentId()).toBe("arr001");
    flush(() => addDocuments([{ id: "arr003", title: "Third", text: "three" }]));
    expect(activeDocumentId()).toBe("arr001");
  });

  it("adds discovered documents without changing the active one or duplicating ids", () => {
    const active = activeDocumentId();
    flush(() =>
      addDocuments([
        { id: active, title: "dup", text: "dup" },
        { id: "new001", title: "New", text: "new" },
      ]),
    );
    expect(documents().at(-1)).toEqual({
      id: "new001",
      title: "New",
      text: "new",
      revision: 0,
      modified: expect.any(Number),
      icon: null,
    });
    expect(documents().filter((doc) => doc.id === active)).toHaveLength(1);
    expect(activeDocumentId()).toBe(active);
    const count = documents().length;
    flush(() => addDocuments([]));
    expect(documents()).toHaveLength(count);
  });

  it("replaces title and text from disk, bumping the revision only for text", () => {
    const id = activeDocumentId();
    flush(() => replaceDocument(id, "  Renamed  outside ", SAMPLE_DOCUMENT));
    expect(title()).toBe("Renamed outside");
    expect(activeRevision()).toBe(0);
    flush(() => replaceDocument(id, "Renamed outside", "new body"));
    expect(docText()).toBe("new body");
    expect(activeRevision()).toBe(1);
    const record = findDocument(id);
    flush(() => replaceDocument(id, "Renamed outside", "new body"));
    expect(findDocument(id)).toBe(record);
    flush(() => replaceDocument("missing", "x", "y"));
    expect(documents()).toHaveLength(TEST_DOCUMENTS.length);
  });

  it("sets and clears a document icon without touching its text, revision, or date", () => {
    const id = TEST_DOCUMENTS[1].id;
    const before = findDocument(id)!;
    const icon = { kind: "emoji", emoji: "📚" } as const;
    flush(() => setDocumentIcon(id, icon));
    expect(findDocument(id)).toEqual({ ...before, icon });
    const record = findDocument(id);
    flush(() => setDocumentIcon(id, { kind: "emoji", emoji: "📚" }));
    expect(findDocument(id)).toBe(record);
    flush(() => setDocumentIcon(id, null));
    expect(findDocument(id)?.icon).toBeNull();
    flush(() => setDocumentIcon("missing", icon));
    expect(documents().map((doc) => doc.icon)).toEqual(TEST_DOCUMENTS.map(() => null));
  });

  it("applies an icon that arrived from disk and keeps the current one when none is given", () => {
    const id = activeDocumentId();
    const icon = { kind: "lucide", name: "map", color: "teal" } as const;
    const revision = activeRevision();
    flush(() => replaceDocument(id, title(), docText(), 5, icon));
    expect(activeDocument().icon).toEqual(icon);
    expect(activeRevision()).toBe(revision);
    flush(() => replaceDocument(id, title(), "changed on disk"));
    expect(activeDocument().icon).toEqual(icon);
    flush(() => replaceDocument(id, title(), "changed on disk", 6, null));
    expect(activeDocument().icon).toBeNull();
    flush(() =>
      loadDocuments([
        { id: "abc123", title: "A", text: "a", icon: { kind: "emoji", emoji: "📝" } },
      ]),
    );
    expect(findDocument("abc123")?.icon).toEqual({ kind: "emoji", emoji: "📝" });
  });

  it("stamps every local edit and keeps the timestamp a document arrived with", () => {
    vi.useFakeTimers();
    const day = new Date(2026, 2, 18, 9, 0).getTime();
    vi.setSystemTime(day);
    flush(() => loadDocuments([{ id: "abc123", title: "A", text: "a", modified: 1_000 }]));
    expect(findDocument("abc123")?.modified).toBe(1_000);

    vi.setSystemTime(day + 60_000);
    flush(() => saveDocumentText("abc123", "a edited"));
    expect(findDocument("abc123")?.modified).toBe(day + 60_000);

    vi.setSystemTime(day + 120_000);
    flush(() => saveDocumentText("abc123", "a edited"));
    expect(findDocument("abc123")?.modified).toBe(day + 60_000);

    flush(() => setTitle("Renamed"));
    expect(findDocument("abc123")?.modified).toBe(day + 120_000);

    vi.setSystemTime(day + 180_000);
    flush(() => updateDocumentText("abc123", "a again"));
    expect(findDocument("abc123")?.modified).toBe(day + 180_000);

    flush(() => replaceDocument("abc123", "Renamed", "from disk", 500));
    expect(findDocument("abc123")?.modified).toBe(500);
    flush(() => replaceDocument("abc123", "Renamed", "without a stamp"));
    expect(findDocument("abc123")?.modified).toBe(day + 180_000);

    vi.setSystemTime(day + 240_000);
    flush(() => addDocuments([{ id: "new001", title: "New", text: "new" }]));
    expect(findDocument("new001")?.modified).toBe(day + 240_000);
    flush(() => createDocument("Fresh"));
    expect(findDocument(activeDocumentId())?.modified).toBe(day + 240_000);
    vi.useRealTimers();
  });

  it("leaves the library empty when the last document is deleted", () => {
    for (const doc of documents()) flush(() => deleteDocument(doc.id));
    expect(documents()).toEqual([]);
    expect(activeDocumentId()).toBe("");
    expect(activeDocument()).toBe(EMPTY_DOCUMENT);
    expect(title()).toBe("");
    expect(docText()).toBe("");
    flush(() => createDocument("After"));
    expect(documents()).toHaveLength(1);
    expect(activeDocumentId()).toBe(documents()[0].id);
  });

  describe("automatic titles", () => {
    const typeInto = (id: string, text: string) => {
      let current = "";
      for (const character of text) {
        current += character;
        flush(() => saveDocumentText(id, current));
      }
    };

    it("follows the first line of a new document as it is typed", () => {
      flush(() => createDocument());
      const id = activeDocumentId();
      expect(title()).toBe("Untitled");
      expect(titleIsAutomatic()).toBe(true);
      typeInto(id, "# Trip to Lisbon\n\nPack light");
      expect(title()).toBe("Trip to Lisbon");
      expect(titleIsAutomatic()).toBe(true);
    });

    it("follows edits to an existing heading", () => {
      const id = activeDocumentId();
      expect(titleIsAutomatic()).toBe(true);
      flush(() => saveDocumentText(id, SAMPLE_DOCUMENT.replace("# Welcome to emdy", "# Hello")));
      expect(title()).toBe("Hello");
    });

    it("returns to Untitled when the text is cleared, then follows again", () => {
      flush(() => createDocument());
      const id = activeDocumentId();
      flush(() => saveDocumentText(id, "Draft idea"));
      expect(title()).toBe("Draft idea");
      flush(() => saveDocumentText(id, ""));
      expect(title()).toBe("Untitled");
      flush(() => saveDocumentText(id, "Second idea"));
      expect(title()).toBe("Second idea");
    });

    it("keeps a title the user chose while the text changes", () => {
      flush(() => createDocument());
      const id = activeDocumentId();
      flush(() => saveDocumentText(id, "# First"));
      flush(() => setTitle("My own name"));
      expect(titleIsAutomatic()).toBe(false);
      flush(() => saveDocumentText(id, "# Something else"));
      expect(title()).toBe("My own name");
      flush(() => updateDocumentText(id, "# Yet another"));
      expect(title()).toBe("My own name");
    });

    it("keeps a title the user chose even when it looks like a numbered Untitled", () => {
      flush(() => createDocument("Untitled draft", "body"));
      flush(() => saveDocumentText(activeDocumentId(), "# Heading"));
      expect(title()).toBe("Untitled draft");
    });

    it("treats a numbered Untitled from disk as automatic", () => {
      flush(() => addDocuments([{ id: "unt002", title: "Untitled 2", text: "" }]));
      flush(() => saveDocumentText("unt002", "Fresh words"));
      expect(findDocument("unt002")?.title).toBe("Fresh words");
    });

    it("resumes following the first line when the title is cleared", () => {
      const id = activeDocumentId();
      flush(() => setTitle("Pinned"));
      flush(() => saveDocumentText(id, "# Changed heading"));
      expect(title()).toBe("Pinned");
      flush(() => setTitle("   "));
      expect(title()).toBe("Changed heading");
      expect(titleIsAutomatic()).toBe(true);
      flush(() => saveDocumentText(id, "# Changed again"));
      expect(title()).toBe("Changed again");
    });

    it("renames inactive documents edited in the background", () => {
      const [, second] = documents();
      flush(() => updateDocumentText(second.id, "# Renamed in background"));
      expect(findDocument(second.id)?.title).toBe("Renamed in background");
      expect(title()).toBe(SAMPLE_TITLE);
    });

    it("takes titles from disk as they are and does not rename them", () => {
      const id = activeDocumentId();
      flush(() => replaceDocument(id, SAMPLE_TITLE, "# Edited elsewhere"));
      expect(title()).toBe(SAMPLE_TITLE);
      expect(titleIsAutomatic()).toBe(false);
      flush(() => saveDocumentText(id, "# Edited here"));
      expect(title()).toBe(SAMPLE_TITLE);
    });

    it("does not follow text for documents loaded with a mismatched title", () => {
      flush(() => loadDocuments([{ id: "own001", title: "notes", text: "# Q3 plan" }]));
      flush(() => saveDocumentText("own001", "# Q4 plan"));
      expect(findDocument("own001")?.title).toBe("notes");
    });

    it("keeps the id and revision when the title follows the text", () => {
      const id = activeDocumentId();
      const revision = activeRevision();
      flush(() => saveDocumentText(id, "# New name"));
      expect(activeDocumentId()).toBe(id);
      expect(activeRevision()).toBe(revision);
      flush(() => updateDocumentText(id, "# Newer name"));
      expect(activeRevision()).toBe(revision + 1);
      expect(title()).toBe("Newer name");
    });

    it("reports no automatic title when there is no document", () => {
      flush(clearDocumentState);
      expect(titleIsAutomatic()).toBe(false);
    });
  });
});

describe("document listings", () => {
  const record = {
    id: "aaa111",
    title: "Notes",
    text: "body",
    revision: 3,
    modified: 1_000,
    icon: { kind: "emoji" as const, emoji: "🌱" },
  };

  it("keeps only what the sidebar shows", () => {
    expect(toListing(record)).toEqual({ id: "aaa111", title: "Notes", icon: record.icon });
  });

  it("ignores text, revision, and modified time", () => {
    const edited = { ...record, text: "more", revision: 4, modified: 2_000 };
    expect(sameListing(toListing(record), toListing(edited))).toBe(true);
    expect(
      sameListing(
        toListing(record),
        toListing({ ...record, icon: { kind: "emoji", emoji: "🌱" } }),
      ),
    ).toBe(true);
  });

  it("notices a different id, title, or icon", () => {
    const listing = toListing(record);
    expect(sameListing(listing, { ...listing, id: "bbb222" })).toBe(false);
    expect(sameListing(listing, { ...listing, title: "Renamed" })).toBe(false);
    expect(sameListing(listing, { ...listing, icon: null })).toBe(false);
  });
});
