import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  headingGutterMarkers,
  previewRulers,
  RULER_LABEL_INTERVAL,
  rulerColumnCount,
  rulerLabels,
  rulers,
  sourceRulers,
} from "./rulers";

let view: EditorView | undefined;

afterEach(() => {
  view?.destroy();
  view = undefined;
});

function mount(extension: ReturnType<typeof rulers>, doc = "one\ntwo\nthree") {
  const parent = document.createElement("div");
  document.body.append(parent);
  view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [markdown({ base: markdownLanguage }), extension],
    }),
    parent,
  });
  return view;
}

function headingRows(state: EditorState) {
  const rows: string[] = [];
  headingGutterMarkers(state).between(0, state.doc.length, (from, _to, marker) => {
    rows.push(`${state.doc.lineAt(from).number}:${marker.elementClass}`);
  });
  return rows;
}

describe("headingGutterMarkers", () => {
  it("marks the first line of each ATX and setext heading with its level", () => {
    const state = EditorState.create({
      doc: "# One\ntext\n\nTwo\n---\n\n> ### Quoted\n\n    # code\n\n- #### Listed\n\n```\n# fenced\n```",
      extensions: [markdown({ base: markdownLanguage })],
    });
    expect(headingRows(state)).toEqual([
      "1:cm-gutter-heading cm-gutter-h1",
      "4:cm-gutter-heading cm-gutter-h2",
      "7:cm-gutter-heading cm-gutter-h3",
      "11:cm-gutter-heading cm-gutter-h4",
    ]);
  });

  it("marks nothing without a markdown language", () => {
    expect(headingRows(EditorState.create({ doc: "# One" }))).toEqual([]);
  });
});

describe("rulerColumnCount", () => {
  it("counts whole character cells that fit the text width", () => {
    expect(rulerColumnCount(800, 8)).toBe(100);
    expect(rulerColumnCount(805, 8)).toBe(100);
    expect(rulerColumnCount(799.95, 8)).toBe(100);
    expect(rulerColumnCount(790, 8)).toBe(98);
  });

  it("returns zero for unmeasured geometry", () => {
    expect(rulerColumnCount(0, 8)).toBe(0);
    expect(rulerColumnCount(800, 0)).toBe(0);
    expect(rulerColumnCount(Number.NaN, 8)).toBe(0);
    expect(rulerColumnCount(-10, 8)).toBe(0);
  });
});

describe("rulerLabels", () => {
  it("labels every tenth column up to the last visible one", () => {
    expect(RULER_LABEL_INTERVAL).toBe(10);
    expect(rulerLabels(35)).toEqual([10, 20, 30]);
    expect(rulerLabels(40)).toEqual([10, 20, 30, 40]);
    expect(rulerLabels(9)).toEqual([]);
    expect(rulerLabels(12, 5)).toEqual([5, 10]);
  });
});

describe("rulers extension", () => {
  it("adds a line number gutter with the active line highlighted", () => {
    const editor = mount(sourceRulers);
    const numbers = Array.from(
      editor.dom.querySelectorAll(".cm-lineNumbers .cm-gutterElement"),
    ).map((element) => element.textContent);
    expect(numbers).toEqual(expect.arrayContaining(["1", "2", "3"]));
    expect(editor.dom.querySelector(".cm-activeLineGutter")?.textContent).toBe("1");
  });

  it("adds a hidden-from-assistive-tech column ruler panel in source mode", () => {
    const editor = mount(sourceRulers);
    const ruler = editor.dom.querySelector<HTMLElement>(".cm-panels-top .cm-column-ruler");
    expect(ruler).not.toBeNull();
    expect(ruler).toHaveAttribute("aria-hidden", "true");
    expect(ruler?.dataset.testid).toBe("column-ruler");
    expect(ruler?.querySelector(".cm-column-ruler-scale")).not.toBeNull();
  });

  it("omits the column ruler in preview", () => {
    const editor = mount(previewRulers);
    expect(editor.dom.querySelector(".cm-lineNumbers")).not.toBeNull();
    expect(editor.dom.querySelector(".cm-column-ruler")).toBeNull();
  });

  it("classes heading rows in the preview gutter and follows edits", () => {
    const editor = mount(previewRulers, "# Title\nbody");
    const rows = () =>
      Array.from(editor.dom.querySelectorAll(".cm-lineNumbers .cm-gutter-heading")).map(
        (element) =>
          `${element.textContent}:${[...element.classList].filter((name) => name.startsWith("cm-gutter-h")).join(" ")}`,
      );
    expect(rows()).toEqual(["1:cm-gutter-heading cm-gutter-h1"]);

    editor.dispatch({ changes: { from: 0, to: 1, insert: "##" } });
    expect(rows()).toEqual(["1:cm-gutter-heading cm-gutter-h2"]);

    editor.dispatch({ changes: { from: 0, to: 3 } });
    expect(rows()).toEqual([]);
  });

  it("leaves source gutter rows unclassed", () => {
    const editor = mount(sourceRulers, "# Title\nbody");
    expect(editor.dom.querySelector(".cm-gutter-heading")).toBeNull();
  });

  it("returns shared instances so compartments can compare them", () => {
    expect(sourceRulers).not.toBe(previewRulers);
    expect(rulers({ columns: true })).not.toBe(sourceRulers);
  });
});
