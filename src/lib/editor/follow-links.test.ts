import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createEditorExtensions } from "./extensions";
import { livePreview } from "./live-preview";
import { followLinks, linkHrefAt, readOnlyPreview } from "./follow-links";

let view: EditorView | undefined;

function mount(doc: string, readOnly = true) {
  const hooks = { followLocal: vi.fn(), openExternal: vi.fn() };
  view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [
        ...createEditorExtensions(),
        livePreview,
        followLinks(hooks),
        readOnly ? readOnlyPreview : [],
      ],
    }),
    parent: document.body,
  });
  return { view, hooks };
}

function linkNamed(editor: EditorView, text: string): HTMLElement {
  const link = [...editor.contentDOM.querySelectorAll<HTMLElement>(".cm-live-link")].find(
    (element) => element.textContent === text,
  );
  if (!link) throw new Error(`no link ${text}`);
  return link;
}

afterEach(() => {
  view?.destroy();
  view = undefined;
});

describe("linkHrefAt", () => {
  it("reads the destination of the link or autolink around a position", () => {
    const doc = "See [notes](Notes.md) and <https://example.com> here.";
    const { state } = mount(doc).view;
    expect(linkHrefAt(state, doc.indexOf("notes"))).toBe("Notes.md");
    expect(linkHrefAt(state, doc.indexOf("example"))).toBe("https://example.com");
    expect(linkHrefAt(state, doc.indexOf("here"))).toBeNull();
  });

  it("resolves angle-bracket targets, reference links, and email autolinks", () => {
    const doc = [
      "[angled](<Other file.md>) [full][ref] [short] <me@example.com> [missing][nope]",
      "",
      "[ref]: Other%20file.md",
      "[short]: #set-up",
    ].join("\n");
    const { state } = mount(doc).view;
    expect(linkHrefAt(state, doc.indexOf("angled"))).toBe("Other file.md");
    expect(linkHrefAt(state, doc.indexOf("full"))).toBe("Other%20file.md");
    expect(linkHrefAt(state, doc.indexOf("short"))).toBe("#set-up");
    expect(linkHrefAt(state, doc.indexOf("me@"))).toBe("mailto:me@example.com");
    expect(linkHrefAt(state, doc.indexOf("missing"))).toBeNull();
  });
});

describe("followLinks in the read-only preview", () => {
  it("follows reference and angle-bracket links and never opens an unsafe scheme", () => {
    const { view: editor, hooks } = mount(
      "[angled](<Other file.md>) [full][ref] [bad](javascript:alert(1)) [data](data:text/html,hi) [site](https://example.com)\n\n[ref]: Notes.md",
    );
    linkNamed(editor, "angled").click();
    expect(hooks.followLocal).toHaveBeenLastCalledWith("Other file.md");
    linkNamed(editor, "full").click();
    expect(hooks.followLocal).toHaveBeenLastCalledWith("Notes.md");
    const bad = new MouseEvent("click", { bubbles: true, cancelable: true });
    linkNamed(editor, "bad").dispatchEvent(bad);
    expect(bad.defaultPrevented).toBe(true);
    linkNamed(editor, "data").click();
    linkNamed(editor, "bad").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    expect(hooks.followLocal).toHaveBeenCalledTimes(2);
    expect(hooks.openExternal).not.toHaveBeenCalled();
    linkNamed(editor, "site").click();
    expect(hooks.openExternal).toHaveBeenCalledWith("https://example.com");
  });

  it("gives heading lines a heading role and level", () => {
    const { view: editor } = mount("# One\n\ntext\n\n### Three\n\nSetext\n---");
    const headings = [...editor.contentDOM.querySelectorAll<HTMLElement>("[role=heading]")];
    expect(headings.map((line) => [line.textContent, line.getAttribute("aria-level")])).toEqual([
      ["One", "1"],
      ["Three", "3"],
      ["Setext", "2"],
    ]);
  });

  it("locks the document and the content element", () => {
    const { view: editor } = mount("text");
    expect(editor.state.readOnly).toBe(true);
    expect(editor.contentDOM.getAttribute("contenteditable")).toBe("false");
  });

  it("follows local links inside the app and opens external ones", () => {
    const { view: editor, hooks } = mount(
      "[notes](Notes.md) [top](#intro) [site](https://example.com)",
    );
    linkNamed(editor, "notes").click();
    expect(hooks.followLocal).toHaveBeenLastCalledWith("Notes.md");
    linkNamed(editor, "top").click();
    expect(hooks.followLocal).toHaveBeenLastCalledWith("#intro");
    linkNamed(editor, "site").click();
    expect(hooks.openExternal).toHaveBeenCalledWith("https://example.com");
    expect(hooks.followLocal).toHaveBeenCalledTimes(2);
  });

  it("renders links as focusable links that open with Enter", () => {
    const { view: editor, hooks } = mount("[notes](Notes.md)");
    const link = linkNamed(editor, "notes");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("role")).toBe("link");
    expect(link.getAttribute("tabindex")).toBe("0");
    expect(link.hasAttribute("href")).toBe(false);
    link.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(hooks.followLocal).toHaveBeenCalledWith("Notes.md");
  });

  it("follows links rendered inside a table and blocks middle clicks on local ones", () => {
    const { view: editor, hooks } = mount(
      "Intro\n\n| Doc | Site |\n| - | - |\n| [notes](Notes.md) | [site](https://example.com) |",
    );
    const cells = editor.contentDOM.querySelectorAll<HTMLAnchorElement>("td a");
    const [local, external] = [...cells];
    local.click();
    expect(hooks.followLocal).toHaveBeenCalledWith("Notes.md");
    const middle = new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 });
    local.dispatchEvent(middle);
    expect(middle.defaultPrevented).toBe(true);
    const externalMiddle = new MouseEvent("auxclick", {
      bubbles: true,
      cancelable: true,
      button: 1,
    });
    external.dispatchEvent(externalMiddle);
    expect(externalMiddle.defaultPrevented).toBe(false);
    expect(hooks.followLocal).toHaveBeenCalledTimes(1);
  });

  it("disables task checkboxes and leaves tables closed when clicked", () => {
    const doc = "- [ ] task\n\n| a |\n| - |\n| 1 |";
    const { view: editor } = mount(doc);
    const box = editor.contentDOM.querySelector<HTMLInputElement>(".cm-live-task input")!;
    expect(box.getAttribute("aria-disabled")).toBe("true");
    expect(box.getAttribute("aria-label")).toBe("Open task");
    box.click();
    expect(box.checked).toBe(false);
    editor.contentDOM.querySelector<HTMLElement>("td")!.click();
    expect(editor.state.doc.toString()).toBe(doc);
    expect(editor.contentDOM.querySelector(".cm-live-table-widget")).not.toBeNull();
  });
});

describe("followLinks in the editable preview", () => {
  it("follows a relative table link in the app and never lets the browser navigate", () => {
    const { view: editor, hooks } = mount(
      "Intro\n\n| Doc | Site |\n| - | - |\n| [notes](Other.md) | [site](https://example.com) |",
      false,
    );
    expect(editor.state.readOnly).toBe(false);
    const [local, external] = [...editor.contentDOM.querySelectorAll<HTMLAnchorElement>("td a")];
    expect(local.hasAttribute("href")).toBe(false);
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    local.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(hooks.followLocal).toHaveBeenCalledWith("Other.md");
    const middle = new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 });
    local.dispatchEvent(middle);
    expect(middle.defaultPrevented).toBe(true);
    local.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(hooks.followLocal).toHaveBeenCalledTimes(2);

    const externalMiddle = new MouseEvent("auxclick", {
      bubbles: true,
      cancelable: true,
      button: 1,
    });
    external.dispatchEvent(externalMiddle);
    expect(externalMiddle.defaultPrevented).toBe(false);
    external.click();
    expect(hooks.openExternal).toHaveBeenCalledWith("https://example.com");
    expect(editor.state.doc.toString()).toContain("[notes](Other.md)");
  });

  it("leaves inline links to place the cursor for editing", () => {
    const { view: editor, hooks } = mount("[notes](Notes.md)", false);
    const link = editor.contentDOM.querySelector<HTMLElement>(".cm-live-link")!;
    expect(link.tagName).not.toBe("A");
    link.click();
    expect(hooks.followLocal).not.toHaveBeenCalled();
  });
});

describe("heading semantics in the editable preview", () => {
  it("leaves heading lines as plain editable lines", () => {
    const { view: editor } = mount("# One\n\n## Two", false);
    expect(editor.contentDOM.querySelectorAll("[role=heading]")).toHaveLength(0);
    expect(editor.contentDOM.querySelectorAll(".cm-live-heading")).toHaveLength(2);
  });
});
