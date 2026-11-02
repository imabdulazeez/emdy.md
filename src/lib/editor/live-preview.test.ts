import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createEditorExtensions } from "./extensions";
import {
  COPY_FEEDBACK_MS,
  blockquoteContent,
  fencedCodeContent,
  livePreview,
} from "./live-preview";

const DOC = "Intro\n\n```ts\nconst a = 1;\nlet b;\n```\n\nAfter";
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
let view: EditorView | undefined;

function mount(doc: string): EditorView {
  view = new EditorView({
    state: EditorState.create({ doc, extensions: [...createEditorExtensions(), livePreview] }),
    parent: document.body,
  });
  return view;
}

function lines(editor: EditorView): HTMLElement[] {
  return [...editor.contentDOM.querySelectorAll<HTMLElement>(".cm-line")];
}

function stubClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  return writeText;
}

afterEach(() => {
  view?.destroy();
  view = undefined;
  if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
  vi.useRealTimers();
});

describe("fencedCodeContent", () => {
  it("returns the text between the fences", () => {
    const state = EditorState.create({ doc: DOC, extensions: createEditorExtensions() });
    expect(fencedCodeContent(state, DOC.indexOf("```"))).toBe("const a = 1;\nlet b;");
    expect(fencedCodeContent(state, DOC.indexOf("const"))).toBe("const a = 1;\nlet b;");
  });

  it("returns an empty string outside a fenced block or for an empty block", () => {
    const state = EditorState.create({ doc: DOC, extensions: createEditorExtensions() });
    expect(fencedCodeContent(state, 0)).toBe("");
    const empty = EditorState.create({ doc: "```\n```", extensions: createEditorExtensions() });
    expect(fencedCodeContent(empty, 0)).toBe("");
  });
});

describe("livePreview code blocks", () => {
  it("renders the fence as a header row with the language and a copy button", () => {
    const editor = mount(DOC);
    const [, , fence, first, last, closing] = lines(editor);
    expect(fence).toHaveClass("cm-live-codeblock", "cm-live-codeblock-start", "cm-live-fence-open");
    expect(fence.querySelector(".cm-live-language")).toHaveTextContent("ts");
    expect(fence.textContent).not.toContain("```");
    const copy = fence.querySelector<HTMLButtonElement>(".cm-live-code-action");
    expect(copy).toHaveAttribute("aria-label", "Copy code");
    expect(fence.querySelector("[role='toolbar']")).toHaveAttribute(
      "aria-label",
      "Code block actions",
    );
    expect(first).toHaveClass("cm-live-codeblock", "cm-live-codeblock-body-start");
    expect(last).toHaveClass("cm-live-codeblock");
    expect(last).not.toHaveClass("cm-live-codeblock-end");
    expect(closing).toHaveClass(
      "cm-live-codeblock-end",
      "cm-live-fence-close",
      "cm-live-fence-hidden",
    );
    expect(closing.textContent).toBe("");
  });

  it("shows the filename instead of the language when the fence has a title", () => {
    const editor = mount('```ts title="src/x.ts"\nlet a;\n```');
    expect(lines(editor)[0].querySelector(".cm-live-language")).toHaveTextContent("src/x.ts");
  });

  it("copies the block content and shows transient feedback", async () => {
    vi.useFakeTimers();
    const writeText = stubClipboard();
    const editor = mount(DOC);
    const copy = lines(editor)[2].querySelector<HTMLButtonElement>(".cm-live-code-action")!;
    copy.click();
    expect(writeText).toHaveBeenCalledWith("const a = 1;\nlet b;");
    await vi.advanceTimersByTimeAsync(0);
    expect(copy).toHaveAttribute("aria-label", "Copied");
    expect(copy.dataset.copied).toBe("true");
    vi.advanceTimersByTime(COPY_FEEDBACK_MS);
    expect(copy).toHaveAttribute("aria-label", "Copy code");
    expect(copy.dataset.copied).toBeUndefined();
  });

  it("does not claim success when the clipboard write fails", async () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });
    const editor = mount(DOC);
    const copy = lines(editor)[2].querySelector<HTMLButtonElement>(".cm-live-code-action")!;
    copy.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(copy).toHaveAttribute("aria-label", "Copy code");
  });

  it("keeps the header while editing code lines but reveals the fence on its own line", () => {
    const editor = mount(DOC);
    editor.focus();
    editor.dispatch({ selection: { anchor: DOC.indexOf("const") + 2 } });
    expect(editor.hasFocus).toBe(true);
    expect(lines(editor)[2].querySelector(".cm-live-code-header")).not.toBeNull();

    editor.dispatch({ selection: { anchor: DOC.indexOf("```") } });
    const fence = lines(editor)[2];
    expect(fence.querySelector(".cm-live-code-header")).toBeNull();
    expect(fence.textContent).toBe("```ts");
    expect(fence).toHaveClass("cm-live-fence-open");
    expect(fence).not.toHaveClass("cm-live-fence-hidden");
  });

  it("frames an unterminated block down to its last line", () => {
    const editor = mount("```py\nx = 1\ny = 2");
    const [fence, , last] = lines(editor);
    expect(fence).toHaveClass("cm-live-codeblock-start");
    expect(last).toHaveClass("cm-live-codeblock", "cm-live-codeblock-end");
  });

  it("does not let the copy button move the cursor into the block", () => {
    const editor = mount(DOC);
    const copy = lines(editor)[2].querySelector<HTMLButtonElement>(".cm-live-code-action")!;
    const before = editor.state.selection.main.head;
    copy.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    expect(editor.state.selection.main.head).toBe(before);
  });
});

const QUOTE = "Intro\n\n> First *line*\n> second line\n>\n> > nested\n\nAfter";

describe("blockquoteContent", () => {
  it("returns the outermost quote without its own markers", () => {
    const state = EditorState.create({ doc: QUOTE, extensions: createEditorExtensions() });
    const expected = "First *line*\nsecond line\n\n> nested";
    expect(blockquoteContent(state, QUOTE.indexOf(">"))).toBe(expected);
    expect(blockquoteContent(state, QUOTE.indexOf("nested"))).toBe(expected);
  });

  it("keeps lazy continuation lines and strips a quote inside a list item", () => {
    const lazy = EditorState.create({
      doc: "> one\ntwo",
      extensions: createEditorExtensions(),
    });
    expect(blockquoteContent(lazy, 0)).toBe("one\ntwo");
    const listed = EditorState.create({
      doc: "- > quoted\n  > more",
      extensions: createEditorExtensions(),
    });
    expect(blockquoteContent(listed, 4)).toBe("quoted\nmore");
  });

  it("returns an empty string outside a quote", () => {
    const state = EditorState.create({ doc: QUOTE, extensions: createEditorExtensions() });
    expect(blockquoteContent(state, 0)).toBe("");
  });
});

describe("livePreview blockquotes", () => {
  it("adds one copy button to the first line of each top-level quote", () => {
    const editor = mount(`${QUOTE}\n\n> second quote`);
    const buttons = editor.contentDOM.querySelectorAll<HTMLButtonElement>(".cm-live-quote-copy");
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveAttribute("aria-label", "Copy quote");
    expect(buttons[0].closest(".cm-line")).toHaveClass("cm-live-quote-start");
    expect(buttons[0].closest(".cm-line")).toHaveTextContent("First line");
    expect(buttons[1].closest(".cm-line")).toHaveTextContent("second quote");
  });

  it("copies the quote text and shows transient feedback", async () => {
    vi.useFakeTimers();
    const writeText = stubClipboard();
    const editor = mount(QUOTE);
    const copy = editor.contentDOM.querySelector<HTMLButtonElement>(".cm-live-quote-copy")!;
    copy.click();
    expect(writeText).toHaveBeenCalledWith("First *line*\nsecond line\n\n> nested");
    await vi.advanceTimersByTimeAsync(0);
    expect(copy).toHaveAttribute("aria-label", "Copied");
    expect(copy.dataset.copied).toBe("true");
    vi.advanceTimersByTime(COPY_FEEDBACK_MS);
    expect(copy).toHaveAttribute("aria-label", "Copy quote");
    expect(copy.dataset.copied).toBeUndefined();
  });

  it("does not claim success when the clipboard write fails", async () => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });
    const editor = mount(QUOTE);
    const copy = editor.contentDOM.querySelector<HTMLButtonElement>(".cm-live-quote-copy")!;
    copy.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(copy).toHaveAttribute("aria-label", "Copy quote");
  });

  it("does not let the copy button move the cursor or change the document", () => {
    const editor = mount(QUOTE);
    const copy = editor.contentDOM.querySelector<HTMLButtonElement>(".cm-live-quote-copy")!;
    const before = editor.state.selection.main.head;
    copy.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    expect(editor.state.selection.main.head).toBe(before);
    expect(editor.state.doc.toString()).toBe(QUOTE);
  });
});

describe("livePreview lists", () => {
  const LIST = "1. First\n2. Second\n\n- Bullet\n  - Nested\n\n- [ ] Task\n\n1. Item\n   continued";

  it("draws each marker in a gutter ahead of the item's text", () => {
    const editor = mount(LIST);
    const [first, second, , bullet, nested, , task, , item, continued] = lines(editor);
    expect(first).toHaveClass("cm-live-list", "cm-live-list-item");
    expect(first.style.getPropertyValue("--list-depth")).toBe("1");
    expect(first.querySelector(".cm-live-list-marker.cm-live-list-number")).toHaveTextContent("1.");
    expect(first.textContent).toBe("1. First");
    expect(second.querySelector(".cm-live-list-number")).toHaveTextContent("2.");
    expect(bullet.querySelector(".cm-live-list-marker.cm-live-list-bullet")).toHaveTextContent("•");
    expect(bullet.textContent).toBe("•Bullet");
    expect(item).toHaveClass("cm-live-list-item");
    expect(continued).toHaveClass("cm-live-list");
    expect(continued).not.toHaveClass("cm-live-list-item");
    expect(continued.textContent).toBe("continued");
    expect(task.querySelector(".cm-live-list-marker")).toBeNull();
    expect(task.querySelector("input[type='checkbox']")).not.toBeNull();
    expect(task.textContent).toBe("Task");
    expect(nested.style.getPropertyValue("--list-depth")).toBe("2");
    expect(nested.textContent).toBe("•Nested");
  });

  it("keeps the raw marker in the gutter on the line being edited", () => {
    const editor = mount(LIST);
    editor.focus();
    editor.dispatch({ selection: { anchor: LIST.indexOf("Nested") } });
    const nested = lines(editor)[4];
    expect(nested.querySelector(".cm-live-list-marker")).toHaveTextContent("-");
    expect(nested.textContent).toBe("  - Nested");
    expect(nested).toHaveClass("cm-live-list-item");
    expect(lines(editor)[3].textContent).toBe("•Bullet");
  });

  it("leaves code blocks inside an item to their own layout", () => {
    const editor = mount("- Item\n\n  ```\n  code\n  ```");
    const [item, , fence, code] = lines(editor);
    expect(item).toHaveClass("cm-live-list-item");
    expect(fence).not.toHaveClass("cm-live-list");
    expect(code).not.toHaveClass("cm-live-list");
    expect(code.textContent).toBe("  code");
  });
});
