import { describe, expect, it } from "vite-plus/test";
import {
  documentHref,
  documentPath,
  headingSlugs,
  isDocumentId,
  isHeadingSlug,
  makeDocumentId,
  parseDocumentLocation,
  parseDocumentRoute,
  slugify,
} from "./route";

describe("makeDocumentId", () => {
  it("returns six lowercase base36 characters", () => {
    for (let i = 0; i < 50; i++) expect(makeDocumentId()).toMatch(/^[a-z0-9]{6}$/);
  });

  it("avoids ids that are already taken", () => {
    const taken = new Set<string>();
    for (let i = 0; i < 20; i++) taken.add(makeDocumentId(taken));
    expect(taken.size).toBe(20);
    const next = makeDocumentId(taken);
    expect(taken.has(next)).toBe(false);
  });
});

describe("isDocumentId", () => {
  it.each(["abc123", "000000", "zzzzzz"])("accepts %s", (id) => {
    expect(isDocumentId(id)).toBe(true);
  });

  it.each(["", "abc12", "abc1234", "ABC123", "abc-12", "e6afcaa7-19a9-4f45-8b22-a754a146c09c"])(
    "rejects %s",
    (id) => {
      expect(isDocumentId(id)).toBe(false);
    },
  );
});

describe("slugify", () => {
  it("lowercases, strips accents, and collapses separators", () => {
    expect(slugify("  Meeting   Notes: Q3 / 2026!  ")).toBe("meeting-notes-q3-2026");
    expect(slugify("Café résumé")).toBe("cafe-resume");
    expect(slugify("hello_world.md")).toBe("hello-world-md");
  });

  it("returns an empty slug when nothing survives", () => {
    expect(slugify("")).toBe("");
    expect(slugify("🎉🎉🎉")).toBe("");
    expect(slugify("日本語")).toBe("");
  });

  it("truncates long titles at a word boundary", () => {
    const slug = slugify("word ".repeat(30));
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-")).toBe(false);
    expect(slug.startsWith("word-word")).toBe(true);
  });

  it("truncates a single long word hard", () => {
    expect(slugify("a".repeat(100))).toBe("a".repeat(60));
  });
});

describe("isHeadingSlug", () => {
  it.each(["intro", "why-local-first", "code-2", "a1"])("accepts %s", (slug) => {
    expect(isHeadingSlug(slug)).toBe(true);
  });

  it.each(["", "-intro", "intro-", "Intro", "a--b", "a/b", "a b"])("rejects %s", (slug) => {
    expect(isHeadingSlug(slug)).toBe(false);
  });
});

describe("headingSlugs", () => {
  it("slugifies each heading in order", () => {
    expect(headingSlugs([{ text: "Why local-first?" }, { text: "Code" }])).toEqual([
      "why-local-first",
      "code",
    ]);
  });

  it("numbers duplicate headings from the second occurrence", () => {
    expect(headingSlugs([{ text: "Notes" }, { text: "Notes" }, { text: "notes!" }])).toEqual([
      "notes",
      "notes-2",
      "notes-3",
    ]);
  });

  it("falls back to a fixed slug for headings without text", () => {
    expect(headingSlugs([{ text: "🎉" }, { text: "" }])).toEqual(["section", "section-2"]);
  });

  it("produces slugs that parse back", () => {
    for (const slug of headingSlugs([{ text: "A — B" }, { text: "A — B" }, { text: "日本語" }])) {
      expect(isHeadingSlug(slug)).toBe(true);
    }
  });
});

describe("documentPath", () => {
  it("joins the slug and id under /d/", () => {
    expect(documentPath({ id: "k7x2mq", title: "Meeting Notes" })).toBe("/d/meeting-notes-k7x2mq");
  });

  it("falls back to the bare id when the title has no slug", () => {
    expect(documentPath({ id: "k7x2mq", title: "🎉" })).toBe("/d/k7x2mq");
  });

  it("appends the heading as a trailing segment", () => {
    expect(documentPath({ id: "k7x2mq", title: "Notes" }, "why-local-first")).toBe(
      "/d/notes-k7x2mq/why-local-first",
    );
    expect(documentPath({ id: "k7x2mq", title: "Notes" }, null)).toBe("/d/notes-k7x2mq");
  });
});

describe("documentHref", () => {
  it("keeps the document route in the fragment so the host only sees /", () => {
    expect(documentHref({ id: "k7x2mq", title: "Meeting Notes" })).toBe(
      "/#/d/meeting-notes-k7x2mq",
    );
  });

  it("preserves the query string ahead of the fragment", () => {
    expect(documentHref({ id: "k7x2mq", title: "" }, { search: "?q=1" })).toBe("/?q=1#/d/k7x2mq");
  });

  it("includes the heading inside the fragment", () => {
    expect(
      documentHref({ id: "k7x2mq", title: "Notes" }, { search: "?q=1", heading: "code" }),
    ).toBe("/?q=1#/d/notes-k7x2mq/code");
  });
});

describe("parseDocumentRoute", () => {
  it("reads the trailing id regardless of the slug", () => {
    expect(parseDocumentRoute("/d/meeting-notes-k7x2mq")).toEqual({ id: "k7x2mq", heading: null });
    expect(parseDocumentRoute("/d/stale-title-k7x2mq")).toEqual({ id: "k7x2mq", heading: null });
    expect(parseDocumentRoute("/d/k7x2mq")).toEqual({ id: "k7x2mq", heading: null });
  });

  it("reads an optional heading segment", () => {
    expect(parseDocumentRoute("/d/notes-k7x2mq/why-local-first")).toEqual({
      id: "k7x2mq",
      heading: "why-local-first",
    });
    expect(parseDocumentRoute("/d/k7x2mq/code-2")).toEqual({ id: "k7x2mq", heading: "code-2" });
  });

  it.each([
    "/",
    "",
    "/k7x2mq",
    "/d/",
    "/d/abc",
    "/d/notesk7x2mq",
    "/d/notes-K7X2MQ",
    "/d/notes-k7x2mq/",
    "/d/notes-k7x2mq/Extra",
    "/d/notes-k7x2mq/-bad",
    "/d/notes-k7x2mq/a/b",
    "/docs/k7x2mq",
    "/%ZZ",
  ])("rejects %s", (path) => {
    expect(parseDocumentRoute(path)).toBeNull();
  });

  it("round-trips documentPath", () => {
    const doc = { id: makeDocumentId(), title: "Ünïcödé — Title (draft)" };
    expect(parseDocumentRoute(documentPath(doc))).toEqual({ id: doc.id, heading: null });
    expect(parseDocumentRoute(documentPath(doc, "part-2"))).toEqual({
      id: doc.id,
      heading: "part-2",
    });
  });
});

describe("parseDocumentLocation", () => {
  it("reads the document route from the fragment", () => {
    expect(parseDocumentLocation("#/d/meeting-notes-k7x2mq")).toEqual({
      id: "k7x2mq",
      heading: null,
    });
    expect(parseDocumentLocation("#/d/k7x2mq/code")).toEqual({ id: "k7x2mq", heading: "code" });
  });

  it.each(["", "#", "#k7x2mq", "#missing-too-long", "#/d/", "#/d/notes-k7x2mq/a/b", "#heading"])(
    "rejects %s",
    (hash) => {
      expect(parseDocumentLocation(hash)).toBeNull();
    },
  );

  it("round-trips documentHref", () => {
    const doc = { id: makeDocumentId(), title: "Ünïcödé — Title (draft)" };
    const url = new URL(
      documentHref(doc, { search: "?q=1", heading: "intro" }),
      "http://localhost",
    );
    expect(url.pathname).toBe("/");
    expect(url.search).toBe("?q=1");
    expect(parseDocumentLocation(url.hash)).toEqual({ id: doc.id, heading: "intro" });
  });
});
