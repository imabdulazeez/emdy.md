import { describe, expect, it } from "vite-plus/test";
import {
  ARCHIVE_FORMAT,
  ARCHIVE_VERSION,
  archiveFilename,
  describeImport,
  isArchive,
  isArchiveDocument,
  mergeDocuments,
  parseArchive,
  serializeArchive,
  type ArchiveDocument,
} from "./archive";

const doc = (overrides: Partial<ArchiveDocument> = {}): ArchiveDocument => ({
  id: "abc123",
  title: "Notes",
  text: "# Notes",
  created: 1_000,
  modified: 2_000,
  ...overrides,
});

describe("archive validation", () => {
  it("accepts a well-formed document and rejects malformed ones", () => {
    expect(isArchiveDocument(doc())).toBe(true);
    expect(isArchiveDocument(doc({ id: "ABC" }))).toBe(false);
    expect(isArchiveDocument(doc({ created: -1 }))).toBe(false);
    expect(isArchiveDocument(doc({ modified: Number.NaN }))).toBe(false);
    expect(isArchiveDocument({ ...doc(), text: undefined })).toBe(false);
    expect(isArchiveDocument(null)).toBe(false);
    expect(isArchiveDocument("doc")).toBe(false);
  });

  it("requires the format marker, version, timestamp, and unique ids", () => {
    const archive = {
      format: ARCHIVE_FORMAT,
      version: ARCHIVE_VERSION,
      exportedAt: 5,
      documents: [doc(), doc({ id: "def456" })],
    };
    expect(isArchive(archive)).toBe(true);
    expect(isArchive({ ...archive, format: "other" })).toBe(false);
    expect(isArchive({ ...archive, version: 2 })).toBe(false);
    expect(isArchive({ ...archive, exportedAt: "today" })).toBe(false);
    expect(isArchive({ ...archive, documents: {} })).toBe(false);
    expect(isArchive({ ...archive, documents: [doc(), doc()] })).toBe(false);
    expect(isArchive({ ...archive, documents: [doc(), "x"] })).toBe(false);
    expect(isArchive([])).toBe(false);
  });

  it("parses what it serialized and returns null for anything else", () => {
    const text = serializeArchive([doc(), doc({ id: "def456", title: "Other" })], 9);
    expect(text.endsWith("\n")).toBe(true);
    expect(parseArchive(text)).toEqual({
      format: ARCHIVE_FORMAT,
      version: ARCHIVE_VERSION,
      exportedAt: 9,
      documents: [doc(), doc({ id: "def456", title: "Other" })],
    });
    expect(parseArchive("{oops")).toBeNull();
    expect(parseArchive('{"format":"emdy-library"}')).toBeNull();
    expect(parseArchive("[]")).toBeNull();
  });

  it("serializes only the archive fields of each document", () => {
    const text = serializeArchive([{ ...doc(), extra: "dropped" } as ArchiveDocument], 1);
    expect(text).not.toContain("dropped");
    expect(JSON.parse(text).documents[0]).toEqual(doc());
  });

  it("round-trips document icons and drops ones it does not understand", () => {
    const icon = { kind: "monogram", text: "NT", color: "violet" } as const;
    const text = serializeArchive([doc({ icon }), doc({ id: "def456", title: "Plain" })], 3);
    expect(JSON.parse(text).documents[1]).not.toHaveProperty("icon");
    expect(parseArchive(text)?.documents[0].icon).toEqual(icon);
    const odd = JSON.parse(text);
    odd.documents[0].icon = { kind: "monogram", text: "TOO LONG", color: "violet" };
    const parsed = parseArchive(JSON.stringify(odd))!;
    expect(parsed.documents).toHaveLength(2);
    expect(parsed.documents[0]).not.toHaveProperty("icon");
  });

  it("names the file after the local export date", () => {
    expect(archiveFilename(new Date(2026, 8, 11, 23, 30).getTime())).toBe("emdy-2026-09-11.json");
    expect(archiveFilename(new Date(2026, 0, 5).getTime())).toBe("emdy-2026-01-05.json");
  });
});

describe("mergeDocuments", () => {
  const existing = [
    { id: "keep01", title: "Kept", text: "kept text" },
    { id: "same01", title: "Same", text: "same text" },
  ];

  it("keeps free ids, skips exact duplicates, and re-mints colliding ids", () => {
    const plan = mergeDocuments(existing, [
      doc({ id: "same01", title: "Same", text: "same text" }),
      doc({ id: "keep01", title: "Kept", text: "different text" }),
      doc({ id: "new001", title: "New", text: "new text" }),
    ]);
    expect(plan.skipped).toBe(1);
    expect(plan.added.map((item) => item.title)).toEqual(["Kept", "New"]);
    expect(plan.added[0].id).not.toBe("keep01");
    expect(plan.added[0].id).toMatch(/^[a-z0-9]{6}$/);
    expect(plan.added[0].text).toBe("different text");
    expect(plan.added[1].id).toBe("new001");
  });

  it("treats a duplicate title with different text as a new document", () => {
    const plan = mergeDocuments(existing, [doc({ id: "new001", title: "Kept", text: "other" })]);
    expect(plan.added).toHaveLength(1);
    expect(plan.skipped).toBe(0);
  });

  it("skips an exact duplicate even when its id differs", () => {
    const plan = mergeDocuments(existing, [
      doc({ id: "new001", title: "Kept", text: "kept text" }),
    ]);
    expect(plan).toEqual({ added: [], skipped: 1 });
  });

  it("collapses duplicates inside the file and never reuses an id twice", () => {
    const plan = mergeDocuments(existing, [
      doc({ id: "keep01", title: "A", text: "a" }),
      doc({ id: "keep01", title: "B", text: "b" }),
      doc({ id: "new001", title: "A", text: "a" }),
    ]);
    expect(plan.skipped).toBe(1);
    const ids = plan.added.map((item) => item.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids).not.toContain("keep01");
  });

  it("imports everything into an empty library unchanged", () => {
    const incoming = [doc(), doc({ id: "def456", title: "Other" })];
    expect(mergeDocuments([], incoming)).toEqual({ added: incoming, skipped: 0 });
  });
});

describe("describeImport", () => {
  it("summarizes every outcome in plain words", () => {
    expect(describeImport({ imported: 0, skipped: 0 })).toBe("The file has no documents.");
    expect(describeImport({ imported: 0, skipped: 1 })).toBe("That document is already here.");
    expect(describeImport({ imported: 0, skipped: 3 })).toBe("All 3 documents are already here.");
    expect(describeImport({ imported: 1, skipped: 0 })).toBe("Imported 1 document.");
    expect(describeImport({ imported: 2, skipped: 0 })).toBe("Imported 2 documents.");
    expect(describeImport({ imported: 2, skipped: 1 })).toBe(
      "Imported 2 documents, 1 already here.",
    );
  });
});
