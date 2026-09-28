import type { EditorState } from "@codemirror/state";
import { EditorView, WidgetType } from "@codemirror/view";

type SyntaxNode = ReturnType<typeof import("@codemirror/language").syntaxTree>["topNode"];

export interface ImageInfo {
  src: string;
  alt: string;
  title: string | null;
}

/** Relative paths, http(s), and inline data/blob images; anything with another scheme is left as source. */
const SAFE_SRC = /^(?:https?:|data:image\/|blob:|[^:]*$)/i;

export function isSafeImageSrc(src: string): boolean {
  return src.length > 0 && SAFE_SRC.test(src);
}

/** Reads `![alt](src "title")` from the syntax tree; returns null for reference-style or unsafe images. */
export function readImage(state: EditorState, image: SyntaxNode): ImageInfo | null {
  const url = image.getChild("URL");
  if (!url) return null;
  const marks = image.getChildren("LinkMark");
  const open = marks[0];
  const close = marks.find((mark) => state.sliceDoc(mark.from, mark.to) === "]");
  if (!open || !close) return null;
  const src = state.sliceDoc(url.from, url.to).trim().replace(/^<|>$/g, "");
  if (!isSafeImageSrc(src)) return null;
  const titleNode = image.getChild("LinkTitle");
  const title = titleNode ? state.sliceDoc(titleNode.from + 1, titleNode.to - 1) : null;
  return { src, alt: state.sliceDoc(open.to, close.from), title };
}

/**
 * Shows the image itself in place of `![alt](src)`. Clicking it (or moving the
 * cursor onto its line) reveals the Markdown so the alt text or path can be edited.
 */
export class ImageWidget extends WidgetType {
  constructor(
    readonly info: ImageInfo,
    readonly block: boolean,
  ) {
    super();
  }

  eq(other: ImageWidget): boolean {
    return (
      this.info.src === other.info.src &&
      this.info.alt === other.info.alt &&
      this.info.title === other.info.title &&
      this.block === other.block
    );
  }

  get estimatedHeight(): number {
    return this.block ? 240 : -1;
  }

  toDOM(view: EditorView): HTMLElement {
    const figure = document.createElement("span");
    figure.className = this.block
      ? "cm-live-image-widget cm-live-image-block"
      : "cm-live-image-widget";

    const img = document.createElement("img");
    img.src = this.info.src;
    img.alt = this.info.alt;
    if (this.info.title) img.title = this.info.title;
    img.draggable = false;
    img.decoding = "async";
    img.setAttribute("referrerpolicy", "no-referrer");
    img.addEventListener("load", () => view.requestMeasure());
    img.addEventListener("error", () => {
      figure.classList.add("cm-live-image-missing");
      const fallback = document.createElement("span");
      fallback.className = "cm-live-image-fallback";
      fallback.textContent = this.info.alt || this.info.src;
      fallback.title = `Image not found: ${this.info.src}`;
      img.replaceWith(fallback);
      view.requestMeasure();
    });
    figure.append(img);

    if (this.block && this.info.alt) {
      const caption = document.createElement("span");
      caption.className = "cm-live-image-caption";
      caption.textContent = this.info.alt;
      figure.append(caption);
    }
    return figure;
  }

  ignoreEvent(): boolean {
    return false;
  }
}
