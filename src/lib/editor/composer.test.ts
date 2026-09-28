import {
  acceptCompletion,
  CompletionContext,
  completionStatus,
  currentCompletions,
  moveCompletionSelection,
  startCompletion,
  type Completion,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  completionKeymap,
  EMPTY_MENTION_SOURCE,
  HEADING_MENTION,
  hasOpenComposerMenu,
  isProse,
  matchDocuments,
  mentionCompletions,
  mentionTrigger,
  slashCompletions,
  slashTrigger,
  type MentionSource,
  type SlashCommand,
} from "./composer";
import { createEditorExtensions, slashCommands } from "./extensions";

// Monday 28 September 2026, 14:05 local time.
const NOW = new Date(2026, 8, 28, 14, 5);

const SOURCE: MentionSource = {
  documents: () => [
    { id: "notes1", title: "Meeting notes", modified: 3 },
    { id: "plan01", title: "Q4 plan", modified: 5 },
    { id: "brack1", title: "Notes [old]", modified: 1 },
    { id: "today1", title: "Today I learned", modified: 2 },
  ],
  linkTarget: (id) =>
    ({ notes1: "Meeting notes.md", plan01: "Q4 plan.md", brack1: "Notes old.md" })[id] ??
    `${id}.md`,
  title: () => "Weekly review",
  created: () => new Date(2026, 0, 2, 9).getTime(),
  now: () => NOW,
};

function stateOf(doc: string, cursor = doc.length): EditorState {
  const state = EditorState.create({
    doc,
    selection: { anchor: cursor },
    extensions: markdown({ base: markdownLanguage }),
  });
  ensureSyntaxTree(state, state.doc.length, 1_000);
  return state;
}

function complete(
  source: (context: CompletionContext) => CompletionResult | null,
  doc: string,
): CompletionResult | null {
  const state = stateOf(doc);
  return source(new CompletionContext(state, state.doc.length, false));
}

function rows(result: CompletionResult | null) {
  return (result?.options ?? []).map((option) => [
    typeof option.section === "object" ? option.section.name : option.section,
    option.label,
    typeof option.apply === "string" ? option.apply : option.detail,
  ]);
}

const mentions = mentionCompletions(SOURCE);

describe("mentionTrigger", () => {
  it("opens at the start of a word and reads the query up to the cursor", () => {
    expect(mentionTrigger(stateOf("@"), 1)).toEqual({ from: 0, query: "" });
    expect(mentionTrigger(stateOf("Due (@next fri"), 14)).toEqual({ from: 5, query: "next fri" });
    expect(mentionTrigger(stateOf("- [ ] ship @tod"), 15)).toEqual({ from: 11, query: "tod" });
  });

  it("stays shut inside addresses, paths, escapes, and after a space", () => {
    expect(mentionTrigger(stateOf("me@example"), 10)).toBeNull();
    expect(mentionTrigger(stateOf("a/@b"), 4)).toBeNull();
    expect(mentionTrigger(stateOf("\\@b"), 3)).toBeNull();
    expect(mentionTrigger(stateOf("@ today"), 7)).toBeNull();
    expect(mentionTrigger(stateOf("@@"), 2)).toBeNull();
  });

  it("stays shut in code, links, and HTML", () => {
    expect(mentionTrigger(stateOf("`x @tod`", 7), 7)).toBeNull();
    expect(mentionTrigger(stateOf("```\n@tod\n```", 8), 8)).toBeNull();
    expect(mentionTrigger(stateOf("    @tod"), 8)).toBeNull();
    expect(mentionTrigger(stateOf("[a @tod](x)", 7), 7)).toBeNull();
    expect(mentionTrigger(stateOf("<!-- @tod -->", 9), 9)).toBeNull();
  });
});

describe("isProse", () => {
  it("accepts paragraphs, headings, lists, and quotes", () => {
    for (const doc of ["text", "# Heading", "- item", "> quote"]) {
      expect(isProse(stateOf(doc), doc.length - 1)).toBe(true);
    }
  });
});

describe("slashTrigger", () => {
  it("opens at the start of a line, after indentation, list, task, and quote markers", () => {
    expect(slashTrigger(stateOf("/"), 1)).toEqual({ from: 0, query: "" });
    expect(slashTrigger(stateOf("  /head"), 7)).toEqual({ from: 2, query: "head" });
    expect(slashTrigger(stateOf("- [ ] /code"), 11)).toEqual({ from: 6, query: "code" });
    expect(slashTrigger(stateOf("> /quote"), 8)).toEqual({ from: 2, query: "quote" });
    expect(slashTrigger(stateOf("1. /h1"), 6)).toEqual({ from: 3, query: "h1" });
    expect(slashTrigger(stateOf("- > /x"), 6)).toEqual({ from: 4, query: "x" });
    expect(slashTrigger(stateOf(">/x"), 3)).toEqual({ from: 1, query: "x" });
  });

  it("stays shut mid-line and in code", () => {
    expect(slashTrigger(stateOf("and/or"), 6)).toBeNull();
    expect(slashTrigger(stateOf(`${"*   ".repeat(20)}x`), 81)).toBeNull();
    expect(slashTrigger(stateOf(`${">  ".repeat(28)}x`), 85)).toBeNull();
    expect(slashTrigger(stateOf("yes /no"), 7)).toBeNull();
    expect(slashTrigger(stateOf("```\n/h\n```", 6), 6)).toBeNull();
  });
});

describe("matchDocuments", () => {
  it("lists the most recent documents for an empty query", () => {
    expect(matchDocuments(SOURCE.documents(), " ").map((doc) => doc.id)).toEqual([
      "plan01",
      "notes1",
      "today1",
      "brack1",
    ]);
  });

  it("ranks title prefixes, then word starts, then other matches", () => {
    const docs = [
      { id: "a", title: "Annotes", modified: 9 },
      { id: "b", title: "Meeting notes", modified: 1 },
      { id: "c", title: "Notes", modified: 2 },
      { id: "d", title: "Other", modified: 3 },
    ];
    expect(matchDocuments(docs, "NOTES").map((doc) => doc.id)).toEqual(["c", "b", "a"]);
  });
});

describe("mentionCompletions", () => {
  it("shows everyday dates, recent documents, and this document's values for a bare @", () => {
    expect(rows(complete(mentions, "@"))).toEqual([
      ["Dates", "Today", "2026-09-28"],
      ["Dates", "Tomorrow", "2026-09-29"],
      ["Dates", "Yesterday", "2026-09-27"],
      ["Dates", "Now", "2026-09-28 14:05"],
      ["Documents", "Q4 plan", "[Q4 plan](Q4%20plan.md)"],
      ["Documents", "Meeting notes", "[Meeting notes](Meeting%20notes.md)"],
      ["Documents", "Today I learned", "[Today I learned](today1.md)"],
      ["Documents", "Notes [old]", "[Notes \\[old\\]](Notes%20old.md)"],
      ["This document", "Title", "Weekly review"],
      ["This document", "Date created", "2026-01-02"],
    ]);
  });

  it("replaces the whole @query and keeps the menu's own order", () => {
    const result = complete(mentions, "Due @tod");
    expect(result).toMatchObject({ from: 4, to: 8, filter: false });
    expect(rows(result)).toEqual([
      ["Dates", "Today", "2026-09-28"],
      ["Documents", "Today I learned", "[Today I learned](today1.md)"],
    ]);
  });

  it("matches documents anywhere in the title, and variables by any of their names", () => {
    expect(rows(complete(mentions, "@notes"))).toEqual([
      ["Documents", "Notes [old]", "[Notes \\[old\\]](Notes%20old.md)"],
      ["Documents", "Meeting notes", "[Meeting notes](Meeting%20notes.md)"],
    ]);
    expect(rows(complete(mentions, "@created"))).toEqual([
      ["This document", "Date created", "2026-01-02"],
    ]);
    expect(rows(complete(mentions, "@in 2 w"))).toEqual([["Dates", "In 2 weeks", "2026-10-12"]]);
  });

  it("offers headings of this document after @#", () => {
    const doc = "# Plan\n\n## Next steps\n\n## Next steps\n\n#\n\n@#next";
    expect(rows(complete(mentions, doc))).toEqual([
      ["Headings", "Next steps", "[Next steps](#next-steps)"],
      ["Headings", "Next steps", "[Next steps](#next-steps-2)"],
    ]);
    expect(rows(complete(mentions, "# Plan\n\n@hea"))).toEqual([
      ["This document", "Heading…", HEADING_MENTION],
    ]);
    expect(rows(complete(mentions, "@hea"))).toEqual([]);
  });

  it("returns nothing when no option matches, so the menu closes", () => {
    expect(complete(mentions, "@zzz")).toBeNull();
    expect(complete(mentions, "email me@x")).toBeNull();
  });

  it("uses today as the creation date of a document not saved yet, and hides an empty title", () => {
    const fresh = mentionCompletions({ ...SOURCE, created: () => null, title: () => "" });
    expect(rows(complete(fresh, "@created"))).toEqual([
      ["This document", "Date created", "2026-09-28"],
    ]);
    expect(complete(fresh, "@title")).toBeNull();
    expect(EMPTY_MENTION_SOURCE.documents()).toEqual([]);
    expect(EMPTY_MENTION_SOURCE.linkTarget("x")).toBe("");
    expect(EMPTY_MENTION_SOURCE.created()).toBeNull();
    expect(EMPTY_MENTION_SOURCE.now()).toBeInstanceOf(Date);
  });
});

describe("slashCompletions", () => {
  it("lists every block from the shortcut registry in order, with its keys", () => {
    const commands = slashCommands(true);
    expect(commands.map((command) => command.label)).toEqual([
      "Paragraph",
      "Heading 1",
      "Heading 2",
      "Heading 3",
      "Heading 4",
      "Heading 5",
      "Heading 6",
      "Blockquote",
      "Bullet list",
      "Numbered list",
      "Task list",
      "Code block",
      "Insert table",
      "Horizontal rule",
      "Insert footnote",
    ]);
    expect(commands[2].detail).toBe("⌘⌥2");
    expect(slashCommands(false)[2].detail).toBe("Ctrl+Alt+2");
  });

  it("completes from after the slash and ranks by registry order", () => {
    const run = vi.fn(() => true);
    const commands: SlashCommand[] = [
      { label: "First", detail: "", run },
      { label: "Second", detail: "", run },
    ];
    const result = complete(slashCompletions(commands), "- /se");
    expect(result).toMatchObject({ from: 3, to: 5 });
    expect(result?.options.map((option: Completion) => [option.label, option.boost])).toEqual([
      ["First", -0],
      ["Second", -1],
    ]);
    expect(result?.validFor instanceof RegExp && result.validFor.test("heading 2")).toBe(true);
    expect(complete(slashCompletions(commands), "text")).toBeNull();
  });
});

describe("hasOpenComposerMenu", () => {
  it("finds a menu open in the editor a key came from", () => {
    const editor = document.createElement("div");
    editor.className = "cm-editor";
    const content = document.createElement("div");
    editor.append(content);
    expect(hasOpenComposerMenu(content)).toBe(false);
    const menu = document.createElement("div");
    menu.className = "cm-tooltip-autocomplete";
    editor.append(menu);
    expect(hasOpenComposerMenu(content)).toBe(true);
    expect(hasOpenComposerMenu(document.body)).toBe(false);
    expect(hasOpenComposerMenu(null)).toBe(false);
  });
});

describe("completion keys", () => {
  it("leave the keys to editing when no menu is open", () => {
    const parent = document.createElement("div");
    const view = new EditorView({ state: stateOf("text"), parent });
    for (const binding of completionKeymap) expect(binding.run?.(view)).toBe(false);
    view.destroy();
  });
});

describe("the composer in the editor", () => {
  let view: EditorView | undefined;

  afterEach(() => {
    view?.destroy();
    view = undefined;
  });

  function mount(doc: string) {
    const parent = document.createElement("div");
    document.body.append(parent);
    view = new EditorView({
      state: EditorState.create({
        doc,
        selection: { anchor: doc.length },
        extensions: createEditorExtensions({ mentions: SOURCE }),
      }),
      parent,
    });
    return view;
  }

  async function open(editor: EditorView) {
    startCompletion(editor);
    await vi.waitFor(() => expect(completionStatus(editor.state)).toBe("active"));
  }

  // CodeMirror ignores menu keys for a moment after the menu opens, so a fast typist's
  // Enter still makes a new line; wait that moment out before accepting.
  async function accept(editor: EditorView) {
    await vi.waitFor(() => expect(acceptCompletion(editor)).toBe(true));
  }

  it("inserts a date for @today", async () => {
    const editor = mount("Due @tod");
    await open(editor);
    expect(currentCompletions(editor.state).map((option) => option.label)).toEqual([
      "Today",
      "Today I learned",
    ]);
    await accept(editor);
    expect(editor.state.doc.toString()).toBe("Due 2026-09-28");
  });

  it("inserts a link to another document", async () => {
    const editor = mount("See @meet");
    await open(editor);
    await accept(editor);
    expect(editor.state.doc.toString()).toBe("See [Meeting notes](Meeting%20notes.md)");
  });

  it("reopens on headings after choosing Heading…", async () => {
    const editor = mount("## Next steps\n\n@head");
    await open(editor);
    await accept(editor);
    expect(editor.state.doc.toString()).toBe(`## Next steps\n\n${HEADING_MENTION}`);
    await vi.waitFor(() =>
      expect(currentCompletions(editor.state).map((option) => option.label)).toEqual([
        "Next steps",
      ]),
    );
    await accept(editor);
    expect(editor.state.doc.toString()).toBe("## Next steps\n\n[Next steps](#next-steps)");
  });

  it("runs a block command from the slash menu in place of the typed text", async () => {
    const editor = mount("Intro\n/head");
    await open(editor);
    expect(currentCompletions(editor.state)[0].label).toBe("Heading 1");
    await vi.waitFor(() => expect(moveCompletionSelection(true)(editor)).toBe(true));
    await accept(editor);
    expect(editor.state.doc.toString()).toBe("Intro\n## ");
  });
});
