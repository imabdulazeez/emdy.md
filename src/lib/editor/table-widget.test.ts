import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { within } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { TableCopyRequest } from "~/lib/table-clipboard";
import { createEditorExtensions } from "./extensions";
import { livePreview } from "./live-preview";
import { tableCopyHandler } from "./table-copy";
import { parseTableSource } from "./table-source";

const TABLE = [
  "| Mode | **Bold** \\| pipe | Amount |",
  "| :--- | :---: | ---: |",
  "| `code` | [docs](https://example.com) | *42* |",
  "| short |",
  "| a | b | c | extra |",
].join("\n");
const DOC = `Before\n\n${TABLE}\n\nAfter`;
let view: EditorView | undefined;

function mount(doc: string): EditorView {
  view = new EditorView({
    state: EditorState.create({ doc, extensions: [...createEditorExtensions(), livePreview] }),
    parent: document.body,
  });
  return view;
}

function widget(editor: EditorView): HTMLElement | null {
  return editor.contentDOM.querySelector<HTMLElement>(".cm-live-table-widget");
}

afterEach(() => {
  view?.destroy();
  view = undefined;
});

describe("live table rendering", () => {
  it("keeps relative destinations out of href and opens external ones in a new tab", () => {
    const editor = mount(
      "| h |\n| - |\n| [guide](/guide) [ext](https://x.y) [top](#top) [doc](Other.md) |",
    );
    const [guide, ext, top, doc] = [...widget(editor)!.querySelectorAll("a")];
    for (const [anchor, target] of [
      [guide, "/guide"],
      [top, "#top"],
      [doc, "Other.md"],
    ] as const) {
      expect(anchor).not.toHaveAttribute("href");
      expect(anchor).not.toHaveAttribute("target");
      expect(anchor).toHaveAttribute("data-href", target);
      expect(anchor).toHaveAttribute("role", "link");
      expect(anchor).toHaveAttribute("tabindex", "0");
    }
    expect(ext).toHaveAttribute("href", "https://x.y");
    expect(ext).toHaveAttribute("target", "_blank");
    expect(ext).not.toHaveAttribute("data-href");
  });

  it("resolves full, collapsed and shortcut reference links from their definitions", () => {
    const editor = mount(
      [
        "| h |",
        "| - |",
        "| [full][Ref  One] [Ref Two][] [Ref Three] [nope][missing] |",
        "",
        '[ref one]: https://a.b "T"',
        "[ref two]: </c d>",
        "[ref three]: relative/path",
        "[ref one]: https://ignored.example",
      ].join("\n"),
    );
    const [full, collapsed, shortcut, missing] = [...widget(editor)!.querySelectorAll("a")];
    expect(full).toHaveAttribute("href", "https://a.b");
    expect(full).toHaveTextContent("full");
    expect(collapsed).toHaveAttribute("data-href", "/c d");
    expect(shortcut).toHaveAttribute("data-href", "relative/path");
    expect(missing).toHaveTextContent("nope");
    expect(missing).not.toHaveAttribute("href");
    expect(missing).not.toHaveAttribute("data-href");
  });

  it("links email autolinks with mailto while displaying the address", () => {
    const editor = mount("| h |\n| - |\n| <support@example.com> <https://user@example.com> |");
    const [email, url] = [...widget(editor)!.querySelectorAll("a")];
    expect(email).toHaveAttribute("href", "mailto:support@example.com");
    expect(email).toHaveTextContent("support@example.com");
    expect(url).toHaveAttribute("href", "https://user@example.com");
  });

  it("decodes character entities in cells", () => {
    const editor = mount("| h |\n| - |\n| Tom &amp; Jerry &#169; &copy; |");
    expect(widget(editor)!.querySelector("td")).toHaveTextContent("Tom & Jerry © ©");
  });

  it("opens the right cell for a table nested in a blockquote", () => {
    const doc = "> | a | b |\n> | - | - |\n> | 1 | two |";
    const editor = mount(doc);
    const cell = [...widget(editor)!.querySelectorAll("td")].find(
      (td) => td.textContent === "two",
    )!;
    cell.click();
    expect(editor.state.selection.main.head).toBe(doc.indexOf("two"));
    expect(widget(editor)).toBeNull();
  });

  it("renders the table as HTML with header, body, alignment and inline formatting", () => {
    const editor = mount(DOC);
    const table = widget(editor)?.querySelector("table");
    expect(table).not.toBeNull();
    const headers = [...table!.querySelectorAll("th")];
    expect(headers.map((th) => th.textContent)).toEqual(["Mode", "Bold | pipe", "Amount"]);
    expect(headers[0].dataset.align).toBe("left");
    expect(headers[1].dataset.align).toBe("center");
    expect(headers[2].dataset.align).toBe("right");
    expect(headers[1].querySelector("strong")).toHaveTextContent("Bold");

    const rows = [...table!.querySelectorAll("tbody tr")];
    expect(rows).toHaveLength(3);
    const [first, short, long] = rows.map((row) => [...row.querySelectorAll("td")]);
    expect(first[0].querySelector("code")).toHaveTextContent("code");
    const link = first[1].querySelector("a")!;
    expect(link).toHaveTextContent("docs");
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(first[2].querySelector("em")).toHaveTextContent("42");
    expect(short.map((td) => td.textContent)).toEqual(["short", "", ""]);
    expect(long.map((td) => td.textContent)).toEqual(["a", "b", "c"]);
    expect(editor.contentDOM.textContent).not.toContain("| Mode");
  });

  it("does not link unsafe URLs", () => {
    const editor = mount("| h |\n| - |\n| [x](javascript:alert(1)) |");
    const link = widget(editor)!.querySelector("a")!;
    expect(link).toHaveTextContent("x");
    expect(link).not.toHaveAttribute("href");
  });

  it("does not link destinations that hide a scheme behind a tab", () => {
    const editor = mount(
      ["| h |", "| - |", "| [x][ref] |", "", "[ref]: <java\tscript:alert(1)>"].join("\n"),
    );
    const link = widget(editor)!.querySelector("a")!;
    expect(link).toHaveTextContent("x");
    expect(link).not.toHaveAttribute("href");
  });

  it("opens the grid editor at the clicked cell and renders again when the cursor leaves", () => {
    const editor = mount(DOC);
    const cell = [...widget(editor)!.querySelectorAll("td")].find((td) => td.textContent === "42")!;
    expect(cell.dataset.row).toBe("1");
    expect(cell.dataset.column).toBe("2");
    cell.click();
    expect(editor.hasFocus).toBe(true);
    expect(editor.state.selection.main.head).toBe(DOC.indexOf("*42*"));
    expect(widget(editor)).toBeNull();
    const active = editor.contentDOM.querySelector<HTMLElement>(".cm-table-editor");
    expect(active).not.toBeNull();
    expect(active!.querySelector<HTMLInputElement>('[data-row="1"][data-column="2"]')?.value).toBe(
      "*42*",
    );
    expect(editor.contentDOM.textContent).not.toContain("| Mode");

    editor.dispatch({ selection: { anchor: 0 } });
    expect(widget(editor)).not.toBeNull();
  });

  it("keeps the rendered table while the editor is not focused", () => {
    const editor = mount(DOC);
    editor.dispatch({ selection: { anchor: DOC.indexOf("short") } });
    expect(editor.hasFocus).toBe(false);
    expect(widget(editor)).not.toBeNull();
  });

  it("re-renders when a referenced definition changes outside the table", () => {
    const doc = ["| h |", "| - |", "| [site][ref] |", "", "[ref]: https://old.example"].join("\n");
    const editor = mount(doc);
    expect(widget(editor)!.querySelector("a")).toHaveAttribute("href", "https://old.example");
    editor.dispatch({
      changes: {
        from: doc.indexOf("https://old.example"),
        to: doc.length,
        insert: "https://new.example",
      },
    });
    expect(widget(editor)!.querySelector("a")).toHaveAttribute("href", "https://new.example");
  });

  it("puts a copy button over the table that asks the editor to open the copy menu", () => {
    const handler = vi.fn<(request: TableCopyRequest) => void>();
    view = new EditorView({
      state: EditorState.create({
        doc: DOC,
        extensions: [...createEditorExtensions(), livePreview, tableCopyHandler.of(handler)],
      }),
      parent: document.body,
    });
    const root = widget(view)!;
    expect(root.classList).toContain("table-block");
    const trigger = within(root).getByRole("button", { name: "Copy table" });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    trigger.click();
    expect(handler).toHaveBeenCalledTimes(1);
    const [request] = handler.mock.lastCall!;
    expect(request.anchor).toBe(trigger);
    expect(request.grid).toEqual(parseTableSource(TABLE));
    expect(view.contentDOM.querySelector(".cm-table-editor")).toBeNull();
    expect(widget(view)).toBe(root);
  });

  it("copies a table nested in a blockquote without its markers", () => {
    const handler = vi.fn<(request: TableCopyRequest) => void>();
    const doc = "> | a | b |\n> | - | - |\n> | 1 | two |";
    view = new EditorView({
      state: EditorState.create({
        doc,
        extensions: [...createEditorExtensions(), livePreview, tableCopyHandler.of(handler)],
      }),
      parent: document.body,
    });
    within(widget(view)!).getByRole("button", { name: "Copy table" }).click();
    expect(handler.mock.lastCall![0].grid).toEqual({
      header: ["a", "b"],
      align: [null, null],
      rows: [["1", "two"]],
    });
  });

  it("re-renders when the table source changes", () => {
    const editor = mount(DOC);
    editor.dispatch({
      changes: { from: DOC.indexOf("short"), to: DOC.indexOf("short") + 5, insert: "longer" },
    });
    expect(widget(editor)!.textContent).toContain("longer");
  });
});
