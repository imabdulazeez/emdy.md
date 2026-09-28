import { flush } from "solid-js";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { findPreference, preferenceKey, resetPreferences } from "./preferences";
import {
  applyFontAttribute,
  DOCUMENT_FONTS,
  documentFont,
  documentFontPreference,
  isDocumentFont,
  setDocumentFont,
  WORD_FONTS,
} from "./typography";

afterEach(() => {
  flush(() => resetPreferences());
  delete document.documentElement.dataset.font;
});

describe("document font preference", () => {
  it("defaults to the system sans stack and is listed on the settings page", () => {
    expect(documentFont()).toBe("sans");
    expect(findPreference("font")).toBe(documentFontPreference);
    expect(documentFontPreference.label).toBe("Document font");
    expect(documentFontPreference.control).toEqual({
      kind: "choice",
      options: ["sans", "serif", "mono", "handwriting"],
      labels: { sans: "Sans", serif: "Serif", mono: "Mono", handwriting: "Handwriting" },
    });
  });

  it("accepts only the known fonts", () => {
    for (const font of DOCUMENT_FONTS) expect(isDocumentFont(font)).toBe(true);
    for (const value of ["Serif", "comic", "", null, 1, undefined])
      expect(isDocumentFont(value)).toBe(false);
  });

  it("stores the chosen font under its preference key", () => {
    flush(() => setDocumentFont("serif"));
    expect(documentFont()).toBe("serif");
    expect(window.localStorage.getItem(preferenceKey("font"))).toBe('"serif"');
    flush(() => resetPreferences());
    expect(window.localStorage.getItem(preferenceKey("font"))).toBeNull();
    expect(documentFont()).toBe("sans");
  });

  it("names a Word font for every choice", () => {
    expect(Object.keys(WORD_FONTS).sort()).toEqual([...DOCUMENT_FONTS].sort());
  });
});

describe("applyFontAttribute", () => {
  it("sets the data-font attribute on the root element", () => {
    const root = document.createElement("html");
    applyFontAttribute("handwriting", root);
    expect(root.dataset.font).toBe("handwriting");
    applyFontAttribute("mono");
    expect(document.documentElement.dataset.font).toBe("mono");
  });
});
