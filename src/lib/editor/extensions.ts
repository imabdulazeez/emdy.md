import { defaultKeymap, history, historyKeymap, redo } from "@codemirror/commands";
import {
  markdown,
  markdownLanguage,
  deleteMarkupBackward,
  insertNewlineContinueMarkup,
} from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { HighlightStyle, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { openSearchPanel, search, searchKeymap } from "@codemirror/search";
import { type Extension, type StateCommand } from "@codemirror/state";
import { drawSelection, EditorView, keymap, type KeyBinding } from "@codemirror/view";
import { autoPair, deletePairBackward } from "./auto-pair";
import {
  insertFootnote,
  insertHorizontalRule,
  insertTable,
  setHeading,
  toggleBlockquote,
  toggleBulletList,
  toggleCodeBlock,
  toggleHeading,
  toggleOrderedList,
  toggleTaskList,
} from "./block-commands";
import {
  formatShortcut,
  isMacPlatform,
  SHORTCUTS,
  shortcutKeys,
  type ShortcutId,
} from "~/lib/shortcuts";
import { composerCompletion, type MentionSource, type SlashCommand } from "./composer";
import { tableGridEditor } from "./table-editor";
import {
  continueTaskList,
  dedentListItem,
  indentListItem,
  insertImage,
  insertLink,
  toggleBold,
  toggleInlineCode,
  toggleItalic,
  toggleStrikethrough,
} from "./commands";

export interface EditorHooks {
  onDocChanged?: (view: EditorView) => void;
  onSelectionChanged?: (view: EditorView) => void;
  mentions?: MentionSource;
}

type BlockShortcutId = Extract<(typeof SHORTCUTS)[number], { group: "Blocks" }>["id"];

/** The block commands, keyed by their `SHORTCUTS` entry; the keymap and the `/` menu both read it. */
export const BLOCK_COMMANDS: Record<BlockShortcutId, StateCommand> = {
  paragraph: setHeading(0),
  "heading-1": toggleHeading(1),
  "heading-2": toggleHeading(2),
  "heading-3": toggleHeading(3),
  "heading-4": toggleHeading(4),
  "heading-5": toggleHeading(5),
  "heading-6": toggleHeading(6),
  blockquote: toggleBlockquote,
  "bullet-list": toggleBulletList,
  "ordered-list": toggleOrderedList,
  "task-list": toggleTaskList,
  "code-block": toggleCodeBlock,
  table: insertTable,
  "horizontal-rule": insertHorizontalRule,
  footnote: insertFootnote,
};

/** The `/` menu: every block in registry order, labelled and keyed from `SHORTCUTS`. */
export function slashCommands(mac: boolean = isMacPlatform()): SlashCommand[] {
  return SHORTCUTS.filter(
    (shortcut): shortcut is Extract<(typeof SHORTCUTS)[number], { group: "Blocks" }> =>
      shortcut.group === "Blocks",
  ).map((shortcut) => ({
    label: shortcut.label,
    detail: formatShortcut(shortcut.keys, mac),
    run: BLOCK_COMMANDS[shortcut.id],
  }));
}

const blockBindings: readonly KeyBinding[] = (
  Object.entries(BLOCK_COMMANDS) as [BlockShortcutId & ShortcutId, StateCommand][]
).map(([id, run]) => ({ key: shortcutKeys(id), run }));

/** The app's own editor bindings. Keys come from `SHORTCUTS`; Backspace is plain text editing. */
export const formattingKeymap: readonly KeyBinding[] = [
  { key: shortcutKeys("bold"), run: toggleBold },
  { key: shortcutKeys("italic"), run: toggleItalic },
  { key: shortcutKeys("strikethrough"), run: toggleStrikethrough },
  { key: shortcutKeys("link"), run: insertLink },
  { key: shortcutKeys("image"), run: insertImage },
  { key: shortcutKeys("inline-code"), run: toggleInlineCode },
  ...blockBindings,
  { key: shortcutKeys("find"), run: openSearchPanel },
  // historyKeymap redoes with Ctrl-Y on Windows; the registry promises Mod-Shift-z everywhere.
  { key: shortcutKeys("redo"), run: redo, preventDefault: true },
  { key: shortcutKeys("indent"), run: indentListItem },
  { key: shortcutKeys("dedent"), run: dedentListItem },
  { key: shortcutKeys("continue-list"), run: continueTaskList },
  { key: shortcutKeys("continue-list"), run: insertNewlineContinueMarkup },
  { key: "Backspace", run: deletePairBackward },
  { key: "Backspace", run: deleteMarkupBackward },
];

const RESERVED_KEYS = new Set(["Mod-/", "Alt-A", "Ctrl-m"]);

export const baseKeymap: readonly KeyBinding[] = defaultKeymap.filter(
  (binding) => !(binding.key && RESERVED_KEYS.has(binding.key)),
);

/** Every binding the editor installs, in precedence order. */
export const editorKeymap: readonly KeyBinding[] = [
  ...formattingKeymap,
  ...searchKeymap,
  ...historyKeymap,
  ...baseKeymap,
];

const sourceHighlighting = HighlightStyle.define([
  { tag: tags.heading, color: "var(--color-syntax-heading)" },
  { tag: tags.processingInstruction, color: "var(--color-syntax-marker)" },
  { tag: tags.link, color: "var(--color-syntax-link)" },
  { tag: tags.url, color: "var(--color-syntax-url)" },
  { tag: tags.monospace, color: "var(--color-syntax-code)" },
  { tag: tags.keyword, color: "var(--color-syntax-keyword)" },
  { tag: tags.string, color: "var(--color-syntax-string)" },
  { tag: tags.number, color: "var(--color-syntax-number)" },
  { tag: tags.comment, color: "var(--color-syntax-comment)" },
  { tag: tags.function(tags.variableName), color: "var(--color-syntax-function)" },
  { tag: tags.typeName, color: "var(--color-syntax-type)" },
]);

export function createEditorExtensions(hooks: EditorHooks = {}): Extension[] {
  return [
    history(),
    drawSelection(),
    EditorView.lineWrapping,
    indentUnit.of("  "),
    markdown({ base: markdownLanguage, codeLanguages: languages, addKeymap: false }),
    syntaxHighlighting(sourceHighlighting),
    autoPair,
    tableGridEditor,
    search({ top: true }),
    composerCompletion({ mentions: hooks.mentions, commands: slashCommands() }),
    keymap.of(editorKeymap),
    EditorView.contentAttributes.of({
      "aria-label": "Markdown editor",
      "aria-describedby": "editor-mode-hint",
      spellcheck: "true",
      autocorrect: "on",
      autocapitalize: "sentences",
    }),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) hooks.onDocChanged?.(update.view);
      if (update.docChanged || update.selectionSet) hooks.onSelectionChanged?.(update.view);
    }),
  ];
}
