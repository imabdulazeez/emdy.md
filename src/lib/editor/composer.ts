import {
  acceptCompletion,
  autocompletion,
  closeCompletion,
  moveCompletionSelection,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSection,
} from "@codemirror/autocomplete";
import { syntaxTree } from "@codemirror/language";
import { Prec, type EditorState, type Extension, type StateCommand } from "@codemirror/state";
import { keymap, type EditorView, type KeyBinding } from "@codemirror/view";
import { dateSuggestions, formatDate } from "~/lib/dates";
import { documentLink, headingLink } from "~/lib/markdown/document-links";
import { mentionQuery } from "~/lib/mention-query";
import { headingSlugs } from "~/lib/route";
import { readOutline } from "./outline";

type SyntaxNode = ReturnType<typeof syntaxTree>["topNode"];

/** A completion source that answers synchronously; every menu here reads local state. */
export type CompositionSource = (context: CompletionContext) => CompletionResult | null;

export interface MentionDocument {
  id: string;
  title: string;
  modified: number;
}

/** What the `@` menu can see of the library and the open document. */
export interface MentionSource {
  /** Every document except the one being edited. */
  documents(): readonly MentionDocument[];
  /** The file a link to this document should point at. */
  linkTarget(id: string): string;
  title(): string;
  created(): number | null;
  now(): Date;
}

export interface SlashCommand {
  label: string;
  detail: string;
  run: StateCommand;
}

export interface Trigger {
  from: number;
  query: string;
}

export const HEADING_MENTION = "@#";
export const RECENT_DOCUMENT_LIMIT = 5;
export const DOCUMENT_MATCH_LIMIT = 8;

const DATES: CompletionSection = { name: "Dates", rank: 0 };
const DOCUMENTS: CompletionSection = { name: "Documents", rank: 1 };
const THIS_DOCUMENT: CompletionSection = { name: "This document", rank: 2 };
const HEADINGS: CompletionSection = { name: "Headings", rank: 0 };

const SLASH = /^\s*(?:(?:[-*+]|\d{1,9}[.)])\s+(?:\[[ xX]\]\s+)?|>\s*)*\/([\p{L}\p{N} -]{0,24})$/u;

const NON_PROSE = new Set([
  "InlineCode",
  "CodeText",
  "FencedCode",
  "CodeBlock",
  "CodeInfo",
  "URL",
  "Autolink",
  "Link",
  "Image",
  "LinkReference",
  "HTMLTag",
  "HTMLBlock",
  "Comment",
  "CommentBlock",
  "ProcessingInstruction",
]);

/** Whether a position sits in prose, where typed triggers may open a menu. */
export function isProse(state: EditorState, pos: number): boolean {
  for (
    let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1);
    node;
    node = node.parent
  ) {
    if (NON_PROSE.has(node.name)) return false;
  }
  return true;
}

function textBefore(state: EditorState, pos: number): string {
  return state.sliceDoc(state.doc.lineAt(pos).from, pos);
}

export function mentionTrigger(state: EditorState, pos: number): Trigger | null {
  const before = textBefore(state, pos);
  const found = mentionQuery(before);
  if (!found) return null;
  const from = pos - before.length + found.offset;
  return isProse(state, from) ? { from, query: found.query } : null;
}

export function slashTrigger(state: EditorState, pos: number): Trigger | null {
  const match = SLASH.exec(textBefore(state, pos));
  if (!match) return null;
  const from = pos - match[1].length - 1;
  return isProse(state, from) ? { from, query: match[1] } : null;
}

function normalize(query: string): string {
  return query.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Documents whose title contains the query: prefix matches first, then word starts, then the rest. */
export function matchDocuments(
  documents: readonly MentionDocument[],
  query: string,
): MentionDocument[] {
  const wanted = normalize(query);
  const recent = (a: MentionDocument, b: MentionDocument) => b.modified - a.modified;
  if (wanted === "") return [...documents].sort(recent).slice(0, RECENT_DOCUMENT_LIMIT);
  const scored: { doc: MentionDocument; score: number }[] = [];
  for (const doc of documents) {
    const title = normalize(doc.title);
    const index = title.indexOf(wanted);
    if (index === -1) continue;
    const score = index === 0 ? 0 : /[\s\-_([{"'“‘]/.test(title[index - 1]) ? 1 : 2;
    scored.push({ doc, score });
  }
  return scored
    .sort((a, b) => a.score - b.score || recent(a.doc, b.doc))
    .slice(0, DOCUMENT_MATCH_LIMIT)
    .map((entry) => entry.doc);
}

interface Variable {
  words: readonly string[];
  label: string;
  value: (source: MentionSource) => string;
}

const VARIABLES: readonly Variable[] = [
  { words: ["title"], label: "Title", value: (source) => source.title() },
  {
    words: ["date-created", "created"],
    label: "Date created",
    value: (source) => formatDate(new Date(source.created() ?? source.now().getTime())),
  },
];

function headingOptions(state: EditorState, query: string): Completion[] {
  const wanted = normalize(query);
  const { entries } = readOutline(state);
  const slugs = headingSlugs(entries);
  const options: Completion[] = [];
  entries.forEach((entry, index) => {
    if (entry.text === "" || !entry.text.toLowerCase().includes(wanted)) return;
    options.push({
      label: entry.text,
      detail: `H${entry.level}`,
      apply: headingLink(entry.text, slugs[index]),
      section: HEADINGS,
      type: "heading",
    });
  });
  return options;
}

export function mentionOptions(
  state: EditorState,
  query: string,
  source: MentionSource,
): Completion[] {
  if (query.startsWith("#")) return headingOptions(state, query.slice(1));
  const options: Completion[] = [];
  for (const date of dateSuggestions(query, source.now())) {
    options.push({
      label: date.label,
      detail: date.value,
      apply: date.value,
      section: DATES,
      type: "date",
    });
  }
  for (const doc of matchDocuments(source.documents(), query)) {
    options.push({
      label: doc.title,
      apply: documentLink(doc.title, source.linkTarget(doc.id)),
      section: DOCUMENTS,
      type: "document",
    });
  }
  const wanted = normalize(query);
  for (const variable of VARIABLES) {
    if (!variable.words.some((word) => word.startsWith(wanted))) continue;
    const value = variable.value(source);
    if (value === "") continue;
    options.push({
      label: variable.label,
      detail: value,
      apply: value,
      section: THIS_DOCUMENT,
      type: "variable",
    });
  }
  if ("heading".startsWith(wanted) && readOutline(state).entries.length > 0) {
    options.push({
      label: "Heading…",
      detail: "Link to a section",
      apply: HEADING_MENTION,
      section: THIS_DOCUMENT,
      type: "heading-menu",
    });
  }
  return options;
}

export function mentionCompletions(source: MentionSource): CompositionSource {
  return (context: CompletionContext): CompletionResult | null => {
    const trigger = mentionTrigger(context.state, context.pos);
    if (!trigger) return null;
    const options = mentionOptions(context.state, trigger.query, source);
    if (options.length === 0) return null;
    return { from: trigger.from, to: context.pos, options, filter: false };
  };
}

function runSlashCommand(command: SlashCommand) {
  return (view: EditorView, _completion: Completion, from: number, to: number) => {
    view.dispatch({ changes: { from: from - 1, to, insert: "" }, userEvent: "delete" });
    command.run(view);
  };
}

export function slashOptions(commands: readonly SlashCommand[]): Completion[] {
  return commands.map((command, index) => ({
    label: command.label,
    detail: command.detail,
    boost: -index,
    apply: runSlashCommand(command),
    type: "block",
  }));
}

export function slashCompletions(commands: readonly SlashCommand[]): CompositionSource {
  const options = slashOptions(commands);
  return (context: CompletionContext): CompletionResult | null => {
    const trigger = slashTrigger(context.state, context.pos);
    if (!trigger) return null;
    return {
      from: trigger.from + 1,
      to: context.pos,
      options,
      validFor: /^[\p{L}\p{N} -]*$/u,
    };
  };
}

/** Keys that drive an open menu. Each returns false when no menu is open, so editing keeps them. */
export const completionKeymap: readonly KeyBinding[] = [
  { key: "ArrowDown", run: moveCompletionSelection(true) },
  { key: "ArrowUp", run: moveCompletionSelection(false) },
  { key: "PageDown", run: moveCompletionSelection(true, "page") },
  { key: "PageUp", run: moveCompletionSelection(false, "page") },
  { key: "Enter", run: acceptCompletion },
  { key: "Tab", run: acceptCompletion },
  { key: "Escape", run: closeCompletion },
];

/** Whether a key event comes from an editor whose `@` or `/` menu is open, so Escape belongs to it. */
export function hasOpenComposerMenu(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest(".cm-editor")?.querySelector(".cm-tooltip-autocomplete") != null;
}

export const EMPTY_MENTION_SOURCE: MentionSource = {
  documents: () => [],
  linkTarget: () => "",
  title: () => "",
  created: () => null,
  now: () => new Date(),
};

export interface ComposerOptions {
  mentions?: MentionSource;
  commands: readonly SlashCommand[];
}

/** The `@` menu (dates, documents, headings, document values) and the `/` block menu. */
export function composerCompletion(options: ComposerOptions): Extension {
  return [
    autocompletion({
      override: [
        mentionCompletions(options.mentions ?? EMPTY_MENTION_SOURCE),
        slashCompletions(options.commands),
      ],
      defaultKeymap: false,
      icons: false,
      activateOnCompletion: (completion) => completion.apply === HEADING_MENTION,
      tooltipClass: () => "composer-menu",
    }),
    Prec.highest(keymap.of(completionKeymap)),
  ];
}
