import { syntaxTree } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createEditorExtensions } from "./extensions";
import { isSafeImageSrc, readImage } from "./image-widget";
import { livePreview } from "./live-preview";

let view: EditorView | undefined;

function mount(doc: string): EditorView {
  view = new EditorView({
    state: EditorState.create({ doc, extensions: [...createEditorExtensions(), livePreview] }),
    parent: document.body,
  });
  return view;
}

function widgets(editor: EditorView): HTMLElement[] {
  return [...editor.contentDOM.querySelectorAll<HTMLElement>(".cm-live-image-widget")];
}

function imageNode(state: EditorState) {
  let found: ReturnType<typeof syntaxTree>["topNode"] | null = null;
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name === "Image") found = node.node;
    },
  });
  return found!;
}

afterEach(() => {
  view?.destroy();
  view = undefined;
});

describe("isSafeImageSrc", () => {
  it("accepts relative, http(s), data image and blob sources", () => {
    for (const src of [
      "/a.png",
      "img/a.png",
      "https://x.y/a.png",
      "data:image/png;base64,AA",
      "blob:x",
    ]) {
      expect(isSafeImageSrc(src)).toBe(true);
    }
  });

  it("rejects empty and other schemes", () => {
    for (const src of ["", "javascript:alert(1)", "data:text/html,hi", "file:///etc/passwd"]) {
      expect(isSafeImageSrc(src)).toBe(false);
    }
  });
});

describe("readImage", () => {
  it("extracts src, alt and title", () => {
    const state = EditorState.create({
      doc: '![A **bold** cat](/cat.png "Title")',
      extensions: createEditorExtensions(),
    });
    expect(readImage(state, imageNode(state))).toEqual({
      src: "/cat.png",
      alt: "A **bold** cat",
      title: "Title",
    });
  });

  it("returns null for reference-style images", () => {
    const state = EditorState.create({
      doc: "![alt][ref]\n\n[ref]: /a.png",
      extensions: createEditorExtensions(),
    });
    expect(readImage(state, imageNode(state))).toBeNull();
  });
});

describe("livePreview images", () => {
  it("renders a block image with caption in place of the markup", () => {
    const editor = mount('Intro\n\n![The emdy logo](/logo.svg "Logo")\n\nAfter');
    const [figure] = widgets(editor);
    expect(figure).toHaveClass("cm-live-image-block");
    const img = figure.querySelector("img")!;
    expect(img).toHaveAttribute("src", "/logo.svg");
    expect(img).toHaveAttribute("alt", "The emdy logo");
    expect(img).toHaveAttribute("title", "Logo");
    expect(img).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(figure.querySelector(".cm-live-image-caption")).toHaveTextContent("The emdy logo");
    expect(editor.contentDOM.textContent).not.toContain("![The emdy logo]");
  });

  it("renders an inline image without caption inside a sentence", () => {
    const editor = mount("Build ![status](/badge.svg) is green");
    const [figure] = widgets(editor);
    expect(figure).not.toHaveClass("cm-live-image-block");
    expect(figure.querySelector(".cm-live-image-caption")).toBeNull();
    expect(editor.contentDOM.textContent).toContain("Build ");
    expect(editor.contentDOM.textContent).toContain(" is green");
  });

  it("leaves unsafe and reference images as marked source", () => {
    const editor = mount("![x](javascript:alert(1))\n\n![y][ref]\n\n[ref]: /y.png");
    expect(widgets(editor)).toHaveLength(0);
    expect(editor.contentDOM.querySelectorAll(".cm-live-image")).toHaveLength(2);
    expect(editor.contentDOM.textContent).toContain("![x](javascript:alert(1))");
  });

  it("reveals the markup while the cursor is on the image line", () => {
    const doc = "Intro\n\n![alt](/a.png)";
    const editor = mount(doc);
    editor.focus();
    editor.dispatch({ selection: { anchor: doc.length } });
    expect(widgets(editor)).toHaveLength(0);
    expect(editor.contentDOM.textContent).toContain("![alt](/a.png)");
    editor.dispatch({ selection: { anchor: 0 } });
    expect(widgets(editor)).toHaveLength(1);
  });

  it("re-measures after load and shows a fallback when the image fails", () => {
    const editor = mount("![Missing art](/nope.png)");
    const measure = vi.spyOn(editor, "requestMeasure");
    const [figure] = widgets(editor);
    const img = figure.querySelector("img")!;
    img.dispatchEvent(new Event("load"));
    expect(measure).toHaveBeenCalledTimes(1);
    img.dispatchEvent(new Event("error"));
    expect(measure).toHaveBeenCalledTimes(2);
    expect(figure).toHaveClass("cm-live-image-missing");
    expect(figure.querySelector("img")).toBeNull();
    const fallback = figure.querySelector(".cm-live-image-fallback")!;
    expect(fallback).toHaveTextContent("Missing art");
    expect(fallback).toHaveAttribute("title", "Image not found: /nope.png");
  });
});
