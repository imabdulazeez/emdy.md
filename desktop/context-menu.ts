import type { MenuItemConstructorOptions } from "electron";

export const MAX_SUGGESTIONS = 5;

export interface TextMenuParams {
  isEditable: boolean;
  selectionText: string;
  misspelledWord: string;
  dictionarySuggestions: string[];
  editFlags: {
    canCut: boolean;
    canCopy: boolean;
    canPaste: boolean;
    canSelectAll: boolean;
  };
}

export interface TextMenuActions {
  replaceMisspelling: (word: string) => void;
  addToDictionary: (word: string) => void;
}

export function textContextMenu(
  params: TextMenuParams,
  actions: TextMenuActions,
): MenuItemConstructorOptions[] {
  const menu: MenuItemConstructorOptions[] = [];
  if (params.isEditable && params.misspelledWord) {
    const suggestions = params.dictionarySuggestions.slice(0, MAX_SUGGESTIONS);
    if (suggestions.length === 0) menu.push({ label: "No suggestions", enabled: false });
    for (const suggestion of suggestions)
      menu.push({ label: suggestion, click: () => actions.replaceMisspelling(suggestion) });
    menu.push(
      { type: "separator" },
      {
        label: "Add to dictionary",
        click: () => actions.addToDictionary(params.misspelledWord),
      },
      { type: "separator" },
    );
  }
  if (params.isEditable) {
    menu.push(
      { role: "cut", enabled: params.editFlags.canCut },
      { role: "copy", enabled: params.editFlags.canCopy },
      { role: "paste", enabled: params.editFlags.canPaste },
      { type: "separator" },
      { role: "selectAll", enabled: params.editFlags.canSelectAll },
    );
    return menu;
  }
  if (params.selectionText.trim()) menu.push({ role: "copy", enabled: params.editFlags.canCopy });
  return menu;
}
