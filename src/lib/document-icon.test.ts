import { describe, expect, it } from "vite-plus/test";
import {
  automaticDocumentIcon,
  DOCUMENT_ICON_COLOR_CLASSES,
  DOCUMENT_ICON_COLORS,
  DOCUMENT_ICON_SWATCH_CLASSES,
  deriveDocumentIdentity,
  filterLucideNames,
  firstEmoji,
  graphemes,
  isDocumentIcon,
  isLucideName,
  isMonogramText,
  lucideLabel,
  MAX_LUCIDE_RESULTS,
  normalizeMonogram,
  POPULAR_LUCIDE_ICONS,
  sameDocumentIcon,
} from "./document-icon";

describe("deriveDocumentIdentity", () => {
  it("takes the first letters of the first and last words", () => {
    expect(deriveDocumentIdentity("Reading list").monogram).toBe("RL");
    expect(deriveDocumentIdentity("Welcome to emdy").monogram).toBe("WE");
    expect(deriveDocumentIdentity("  meeting   notes, march ").monogram).toBe("MM");
  });

  it("uses the first and last letter of a single word and prefers a digit", () => {
    expect(deriveDocumentIdentity("Untitled").monogram).toBe("UD");
    expect(deriveDocumentIdentity("Q3").monogram).toBe("Q3");
    expect(deriveDocumentIdentity("Plan2026").monogram).toBe("P2");
    expect(deriveDocumentIdentity("A").monogram).toBe("AA");
  });

  it("handles scripts beyond Latin and falls back when there are no letters", () => {
    expect(deriveDocumentIdentity("ñandú rápido").monogram).toBe("ÑR");
    expect(deriveDocumentIdentity("日本語 メモ").monogram).toBe("日メ");
    expect(deriveDocumentIdentity("🚀 — !!").monogram).toBe("MD");
    expect(deriveDocumentIdentity("").monogram).toBe("MD");
  });

  it("picks a stable colour from the title regardless of case and spacing", () => {
    const color = deriveDocumentIdentity("Reading list").color;
    expect(DOCUMENT_ICON_COLORS).toContain(color);
    expect(deriveDocumentIdentity("  reading LIST ").color).toBe(color);
    const spread = new Set(
      ["Alpha", "Beta", "Gamma", "Delta", "Epsilon", "Zeta", "Eta", "Theta"].map(
        (title) => deriveDocumentIdentity(title).color,
      ),
    );
    expect(spread.size).toBeGreaterThan(3);
  });

  it("builds the automatic monogram icon from the identity", () => {
    const identity = deriveDocumentIdentity("Reading list");
    expect(automaticDocumentIcon("Reading list")).toEqual({
      kind: "monogram",
      text: identity.monogram,
      color: identity.color,
    });
  });
});

describe("icon validation", () => {
  it("accepts each well-formed icon kind", () => {
    expect(isDocumentIcon({ kind: "lucide", name: "book-open", color: "teal" })).toBe(true);
    expect(isDocumentIcon({ kind: "emoji", emoji: "📝" })).toBe(true);
    expect(isDocumentIcon({ kind: "emoji", emoji: "👩🏽‍💻" })).toBe(true);
    expect(isDocumentIcon({ kind: "emoji", emoji: "🇯🇵" })).toBe(true);
    expect(isDocumentIcon({ kind: "monogram", text: "Q3", color: "pink" })).toBe(true);
  });

  it("rejects unknown kinds, colours, names, and malformed values", () => {
    expect(isDocumentIcon(null)).toBe(false);
    expect(isDocumentIcon("📝")).toBe(false);
    expect(isDocumentIcon({ kind: "image", src: "x.png" })).toBe(false);
    expect(isDocumentIcon({ kind: "lucide", name: "Book Open", color: "teal" })).toBe(false);
    expect(isDocumentIcon({ kind: "lucide", name: "book", color: "ultraviolet" })).toBe(false);
    expect(isDocumentIcon({ kind: "emoji", emoji: "a" })).toBe(false);
    expect(isDocumentIcon({ kind: "emoji", emoji: "📝📝" })).toBe(false);
    expect(isDocumentIcon({ kind: "monogram", text: "ABC", color: "red" })).toBe(false);
    expect(isDocumentIcon({ kind: "monogram", text: "", color: "red" })).toBe(false);
    expect(isDocumentIcon({ kind: "monogram", text: "A", color: 3 })).toBe(false);
  });

  it("checks Lucide names and monogram letters", () => {
    expect(isLucideName("arrow-up-01")).toBe(true);
    expect(isLucideName("-arrow")).toBe(false);
    expect(isLucideName("a".repeat(65))).toBe(false);
    expect(isMonogramText("É")).toBe(true);
    expect(isMonogramText("A-")).toBe(false);
    expect(isMonogramText(" A")).toBe(false);
    expect(normalizeMonogram("  ab ")).toBe("AB");
    expect(normalizeMonogram("ｑ３")).toBe("Q3");
  });

  it("finds the first emoji in pasted text", () => {
    expect(firstEmoji("  🚀 launch")).toBe("🚀");
    expect(firstEmoji("#️⃣")).toBe("#️⃣");
    expect(firstEmoji("hello 🚀")).toBeNull();
    expect(firstEmoji("   ")).toBeNull();
  });

  it("counts user-perceived characters", () => {
    expect(graphemes("👩🏽‍💻A")).toEqual(["👩🏽‍💻", "A"]);
  });
});

describe("sameDocumentIcon", () => {
  it("compares icons by value and treats missing icons as automatic", () => {
    expect(sameDocumentIcon(null, undefined)).toBe(true);
    expect(sameDocumentIcon(null, { kind: "emoji", emoji: "📝" })).toBe(false);
    expect(sameDocumentIcon({ kind: "emoji", emoji: "📝" }, { kind: "emoji", emoji: "📝" })).toBe(
      true,
    );
    expect(sameDocumentIcon({ kind: "emoji", emoji: "📝" }, { kind: "emoji", emoji: "📚" })).toBe(
      false,
    );
    expect(
      sameDocumentIcon(
        { kind: "lucide", name: "map", color: "red" },
        { kind: "lucide", name: "map", color: "red" },
      ),
    ).toBe(true);
    expect(
      sameDocumentIcon(
        { kind: "lucide", name: "map", color: "red" },
        { kind: "lucide", name: "map", color: "blue" },
      ),
    ).toBe(false);
    expect(
      sameDocumentIcon(
        { kind: "monogram", text: "MA", color: "red" },
        { kind: "lucide", name: "MA", color: "red" },
      ),
    ).toBe(false);
    expect(
      sameDocumentIcon(
        { kind: "monogram", text: "MA", color: "red" },
        { kind: "emoji", emoji: "📝" },
      ),
    ).toBe(false);
  });
});

describe("filterLucideNames", () => {
  const names = ["book", "book-open", "notebook", "map", "map-pin", ...POPULAR_LUCIDE_ICONS];

  it("shows the popular icons that exist when the query is empty", () => {
    expect(filterLucideNames(names, "  ")).toEqual([...POPULAR_LUCIDE_ICONS]);
    expect(filterLucideNames(["map", "globe", "nope"], "")).toEqual(["globe", "map"]);
  });

  it("ranks prefix matches first and treats spaces as dashes", () => {
    expect(filterLucideNames(["notebook", "book-open", "book"], "book")).toEqual([
      "book-open",
      "book",
      "notebook",
    ]);
    expect(filterLucideNames(names, "Map Pin")).toEqual(["map-pin"]);
    expect(filterLucideNames(names, "zzz")).toEqual([]);
  });

  it("caps the number of results", () => {
    const many = Array.from({ length: 200 }, (_, index) => `icon-${index}`);
    expect(filterLucideNames(many, "icon")).toHaveLength(MAX_LUCIDE_RESULTS);
  });

  it("labels icons in sentence case", () => {
    expect(lucideLabel("book-open")).toBe("Book open");
  });
});

describe("colour classes", () => {
  it("maps every colour to a token-backed text and swatch class", () => {
    for (const color of DOCUMENT_ICON_COLORS) {
      expect(DOCUMENT_ICON_COLOR_CLASSES[color]).toBe(`text-icon-${color}`);
      expect(DOCUMENT_ICON_SWATCH_CLASSES[color]).toBe(`bg-icon-${color}`);
    }
  });
});
