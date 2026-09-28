import { EditorState, type StateCommand, type Transaction } from "@codemirror/state";
import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { flush } from "solid-js";
import { buildTable } from "~/lib/editor/block-commands";
import { insertImage, toggleBold, toggleItalic } from "~/lib/editor/commands";
import { formattingKeymap } from "~/lib/editor/extensions";
import { EMPTY_FORMATS } from "~/lib/editor/format-state";
import { ariaKeyShortcuts, isMacPlatform, shortcutKeys, shortcutTitle } from "~/lib/shortcuts";
import { registerEditorApi, resetEditorApiState } from "~/state/editor-api";
import { resetFormattingState, setActiveFormats } from "~/state/formatting";
import { resetRulersState, showRulers } from "~/state/rulers";
import FormattingToolbar, {
  BLOCK_ACTIONS,
  HEADING_OPTIONS,
  INLINE_ACTIONS,
  INSERT_ACTIONS,
} from "./FormattingToolbar";

afterEach(() => {
  resetEditorApiState();
  resetFormattingState();
  resetRulersState();
});

function runCommandResult(command: StateCommand, doc: string) {
  const state = EditorState.create({ doc });
  let next: EditorState | null = null;
  command({ state, dispatch: (transaction: Transaction) => (next = transaction.state) });
  return (next ?? state).doc.toString();
}

function registerEditor(runCommand: (command: StateCommand) => boolean = vi.fn(() => true)) {
  flush(() =>
    registerEditorApi({
      scrollToLine: vi.fn(),
      focus: vi.fn(),
      getText: () => "",
      flush: vi.fn(),
      runCommand,
      applyEdits: vi.fn(),
    }),
  );
  return runCommand;
}

describe("FormattingToolbar", () => {
  it("renders inline, block, heading, and insert controls with shortcut hints", () => {
    render(() => <FormattingToolbar />);
    expect(screen.getByRole("group", { name: "Text formatting" })).toBeInTheDocument();
    const names = screen.getAllByRole("button").map((button) => button.getAttribute("aria-label"));
    expect(names).toEqual([
      "Text style",
      "Bold",
      "Italic",
      "Strikethrough",
      "Inline code",
      "Insert link",
      "Blockquote",
      "Bullet list",
      "Numbered list",
      "Task list",
      "Code block",
      "Insert",
      "Line and column rulers",
    ]);
    expect(screen.getByRole("button", { name: "Bold" })).toHaveAttribute(
      "title",
      expect.stringMatching(/^Bold \((⌘B|Ctrl\+B)\)$/),
    );
    expect(screen.getByRole("button", { name: "Strikethrough" })).toHaveAttribute(
      "title",
      expect.stringMatching(/^Strikethrough \((⌘⇧X|Ctrl\+Shift\+X)\)$/),
    );
  });

  it("declares unique ids across every action", () => {
    const ids = [...INLINE_ACTIONS, ...BLOCK_ACTIONS, ...INSERT_ACTIONS].map((action) => action.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(HEADING_OPTIONS.map((option) => option.level)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("takes every shortcut from the registry and runs the same command as the key", () => {
    const actions = [...INLINE_ACTIONS, ...BLOCK_ACTIONS, ...INSERT_ACTIONS];
    for (const action of actions) {
      expect(action.keys, action.id).toBe(shortcutKeys(action.id));
      const binding = formattingKeymap.find((candidate) => candidate.key === action.keys);
      expect(binding?.run, action.id).toBe(action.command);
    }
    expect(HEADING_OPTIONS.map((option) => option.keys)).toEqual([
      shortcutKeys("paragraph"),
      ...([1, 2, 3, 4, 5, 6] as const).map((level) => shortcutKeys(`heading-${level}`)),
    ]);
  });

  it("shows each button's registered shortcut in its tooltip and aria-keyshortcuts", () => {
    const mac = isMacPlatform();
    render(() => <FormattingToolbar />);
    for (const action of [...INLINE_ACTIONS, ...BLOCK_ACTIONS]) {
      const button = screen.getByRole("button", { name: action.label });
      expect(button).toHaveAttribute("title", shortcutTitle(action.label, action.keys, mac));
      expect(button).toHaveAttribute("aria-keyshortcuts", ariaKeyShortcuts(action.keys, mac));
    }
  });

  it("is disabled until an editor is registered", () => {
    render(() => <FormattingToolbar />);
    expect(screen.getByRole("button", { name: "Bold" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Text style" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Insert" })).toBeDisabled();
    registerEditor();
    expect(screen.getByRole("button", { name: "Bold" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Text style" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Insert" })).toBeEnabled();
  });

  it("toggles the line and column rulers without an editor", async () => {
    const user = userEvent.setup();
    render(() => <FormattingToolbar />);
    const toggle = screen.getByRole("button", { name: "Line and column rulers" });
    expect(toggle).toBeEnabled();
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(toggle).toHaveAttribute("title", "Show line and column rulers");
    await user.click(toggle);
    expect(showRulers()).toBe(true);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(toggle).toHaveAttribute("title", "Hide line and column rulers");
    expect(window.localStorage.getItem("emdy:pref:rulers")).toBe("true");
    await user.click(toggle);
    expect(showRulers()).toBe(false);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
  });

  it("runs the matching command through the editor api", async () => {
    const user = userEvent.setup();
    const runCommand = registerEditor();
    render(() => <FormattingToolbar />);
    await user.click(screen.getByRole("button", { name: "Bold" }));
    expect(runCommand).toHaveBeenCalledWith(toggleBold);
    await user.click(screen.getByRole("button", { name: "Italic" }));
    expect(runCommand).toHaveBeenLastCalledWith(toggleItalic);
    await user.click(screen.getByRole("button", { name: "Bullet list" }));
    expect(runCommand).toHaveBeenLastCalledWith(BLOCK_ACTIONS[1].command);
  });

  it("reflects the active formats as pressed state", () => {
    registerEditor();
    render(() => <FormattingToolbar />);
    expect(screen.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Insert link" })).not.toHaveAttribute("aria-pressed");
    flush(() =>
      setActiveFormats({
        ...EMPTY_FORMATS,
        bold: true,
        quote: true,
        bulletList: true,
        taskList: true,
      }),
    );
    expect(screen.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Blockquote" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Task list" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Bullet list" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("shows the current heading level on the heading menu and selects levels", async () => {
    const user = userEvent.setup();
    const runCommand = registerEditor();
    render(() => <FormattingToolbar />);
    const heading = screen.getByRole("button", { name: "Text style" });
    expect(heading).toHaveAttribute("data-active", "false");
    expect(heading).toHaveAttribute("title", "Paragraph style");
    flush(() => setActiveFormats({ ...EMPTY_FORMATS, heading: 3 }));
    expect(heading).toHaveTextContent("H3");
    expect(heading).toHaveAttribute("data-active", "true");
    expect(heading).toHaveAttribute("title", "Heading 3");
    await user.click(heading);
    await screen.findByRole("menu", { name: "Text style" });
    expect(screen.getByRole("menuitemradio", { name: "Heading 3" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("menuitemradio", { name: "Paragraph" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await user.click(screen.getByRole("menuitemradio", { name: "Heading 1" }));
    expect(runCommand).toHaveBeenLastCalledWith(HEADING_OPTIONS[1].command);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("inserts blocks from the insert menu", async () => {
    const user = userEvent.setup();
    const runCommand = registerEditor();
    render(() => <FormattingToolbar />);
    await user.click(screen.getByRole("button", { name: "Insert" }));
    await screen.findByRole("menu", { name: "Insert" });
    const labels = screen.getAllByRole("menuitem").map((item) => item.textContent);
    expect(labels.join(" ")).toMatch(/Image.*Table.*Horizontal rule.*Footnote/);
    expect(screen.getByRole("menuitem", { name: "Image" })).toHaveAttribute(
      "aria-keyshortcuts",
      expect.stringMatching(/^(Meta|Control)\+Shift\+I$/),
    );
    await user.click(screen.getByRole("menuitem", { name: "Image" }));
    expect(runCommand).toHaveBeenLastCalledWith(insertImage);
  });

  it("asks for a table size before inserting", async () => {
    const user = userEvent.setup();
    const commands: StateCommand[] = [];
    registerEditor(
      vi.fn((command: StateCommand) => {
        commands.push(command);
        return true;
      }),
    );
    render(() => <FormattingToolbar />);
    await user.click(screen.getByRole("button", { name: "Insert" }));
    await user.click(await screen.findByRole("menuitem", { name: "Table…" }));
    expect(commands).toHaveLength(0);
    const dialog = await screen.findByRole("dialog", { name: "Insert table" });
    expect(dialog).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Columns"));
    await user.type(screen.getByLabelText("Columns"), "2");
    await user.click(screen.getByRole("button", { name: "Insert table" }));
    expect(screen.queryByRole("dialog", { name: "Insert table" })).toBeNull();
    expect(commands).toHaveLength(1);
    expect(runCommandResult(commands[0], "")).toBe(
      `${buildTable({ rows: 3, columns: 2, header: true })}\n`,
    );
  });
});
