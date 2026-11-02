import { describe, expect, it, vi } from "vite-plus/test";
import { MAX_SUGGESTIONS, textContextMenu, type TextMenuParams } from "./context-menu";

const flags = { canCut: true, canCopy: true, canPaste: true, canSelectAll: true };

function params(overrides: Partial<TextMenuParams> = {}): TextMenuParams {
  return {
    isEditable: true,
    selectionText: "",
    misspelledWord: "",
    dictionarySuggestions: [],
    editFlags: flags,
    ...overrides,
  };
}

const actions = () => ({ replaceMisspelling: vi.fn(), addToDictionary: vi.fn() });

describe("textContextMenu", () => {
  it("offers cut, copy, paste, and select all while editing", () => {
    const menu = textContextMenu(params({ editFlags: { ...flags, canCut: false } }), actions());
    expect(menu.map((item) => item.role ?? item.type)).toEqual([
      "cut",
      "copy",
      "paste",
      "separator",
      "selectAll",
    ]);
    expect(menu[0].enabled).toBe(false);
  });

  it("puts spelling suggestions first and replaces the word when one is chosen", () => {
    const handlers = actions();
    const menu = textContextMenu(
      params({ misspelledWord: "teh", dictionarySuggestions: ["the", "tea", "ten"] }),
      handlers,
    );
    expect(menu.slice(0, 3).map((item) => item.label)).toEqual(["the", "tea", "ten"]);
    (menu[0].click as () => void)();
    expect(handlers.replaceMisspelling).toHaveBeenCalledWith("the");
  });

  it("caps the suggestions and adds a word to the local dictionary", () => {
    const handlers = actions();
    const menu = textContextMenu(
      params({
        misspelledWord: "emdy",
        dictionarySuggestions: ["a", "b", "c", "d", "e", "f", "g"],
      }),
      handlers,
    );
    const suggestions = menu.filter((item) => item.label && item.click && item.label.length === 1);
    expect(suggestions).toHaveLength(MAX_SUGGESTIONS);
    const add = menu.find((item) => item.label === "Add to dictionary")!;
    (add.click as () => void)();
    expect(handlers.addToDictionary).toHaveBeenCalledWith("emdy");
  });

  it("says so when a misspelled word has no suggestions", () => {
    const menu = textContextMenu(params({ misspelledWord: "zzzq" }), actions());
    expect(menu[0]).toEqual({ label: "No suggestions", enabled: false });
  });

  it("offers only copy for a selection outside editable text", () => {
    const menu = textContextMenu(
      params({ isEditable: false, selectionText: "read-only words", misspelledWord: "wrods" }),
      actions(),
    );
    expect(menu).toEqual([{ role: "copy", enabled: true }]);
  });

  it("shows nothing when there is nothing to act on", () => {
    expect(textContextMenu(params({ isEditable: false, selectionText: "  " }), actions())).toEqual(
      [],
    );
  });
});
