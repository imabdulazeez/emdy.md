import { syntaxTree } from "@codemirror/language";
import type { EditorState, Extension, Range } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { COPY_FEEDBACK_MS, copyText } from "~/lib/clipboard";
import { fenceLabel } from "./fence-info";
import { ImageWidget, readImage } from "./image-widget";
import { liveTables } from "./table-widget";

export { COPY_FEEDBACK_MS };

const INLINE_CLASSES: Record<string, string> = {
  StrongEmphasis: "cm-live-strong",
  Emphasis: "cm-live-emphasis",
  Strikethrough: "cm-live-strike",
  InlineCode: "cm-live-code",
  Link: "cm-live-link",
  Autolink: "cm-live-link",
  TableDelimiter: "cm-live-table-delimiter",
};

const READER_LINK = Decoration.mark({
  class: "cm-live-link",
  tagName: "a",
  attributes: { role: "link", tabindex: "0" },
});

const SVG_NS = "http://www.w3.org/2000/svg";
const COPY_ICON = [
  "M8 8h11a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z",
  "M16 8V5a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h3",
];
const CHECK_ICON = ["M20 6 9 17l-5-5"];

function iconElement(paths: readonly string[]): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.75");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  return svg;
}

/** Text between the fences of the fenced code block that contains `pos`. */
export function fencedCodeContent(state: EditorState, pos: number): string {
  let node = syntaxTree(state).resolveInner(pos, 1);
  while (node.name !== "FencedCode") {
    if (!node.parent) return "";
    node = node.parent;
  }
  const text = node.getChild("CodeText");
  return text ? state.sliceDoc(text.from, text.to) : "";
}

class TextWidget extends WidgetType {
  constructor(
    readonly text: string,
    readonly className: string,
  ) {
    super();
  }

  eq(other: TextWidget): boolean {
    return this.text === other.text && this.className === other.className;
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = this.className;
    span.textContent = this.text;
    return span;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

const copyTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

/**
 * Header row of a fenced code block: the language (or filename) on the left
 * and a copy button on the right. Clicking the label moves the cursor onto the
 * fence line so the info string can be edited; the button is handled here.
 */
class CodeHeaderWidget extends WidgetType {
  constructor(readonly info: string) {
    super();
  }

  eq(other: CodeHeaderWidget): boolean {
    return this.info === other.info;
  }

  toDOM(view: EditorView): HTMLElement {
    const header = document.createElement("span");
    header.className = "cm-live-code-header";

    const label = document.createElement("span");
    label.className = "cm-live-language";
    label.textContent = fenceLabel(this.info);

    const actions = document.createElement("span");
    actions.className = "cm-live-code-actions";
    actions.setAttribute("role", "toolbar");
    actions.setAttribute("aria-label", "Code block actions");

    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "cm-live-code-action";
    copy.setAttribute("aria-label", "Copy code");
    copy.title = "Copy code";
    copy.append(iconElement(COPY_ICON));
    copy.addEventListener("mousedown", (event) => event.preventDefault());
    copy.addEventListener("click", () => {
      const code = fencedCodeContent(view.state, view.posAtDOM(header));
      void copyText(code).then((copied) => {
        if (copied && copy.isConnected) this.showCopied(copy);
      });
    });

    actions.append(copy);
    header.append(label, actions);
    return header;
  }

  private showCopied(button: HTMLButtonElement): void {
    const pending = copyTimers.get(button);
    if (pending) clearTimeout(pending);
    button.replaceChildren(iconElement(CHECK_ICON));
    button.setAttribute("aria-label", "Copied");
    button.title = "Copied";
    button.dataset.copied = "true";
    copyTimers.set(
      button,
      setTimeout(() => {
        copyTimers.delete(button);
        button.replaceChildren(iconElement(COPY_ICON));
        button.setAttribute("aria-label", "Copy code");
        button.title = "Copy code";
        delete button.dataset.copied;
      }, COPY_FEEDBACK_MS),
    );
  }

  ignoreEvent(event: Event): boolean {
    return event.target instanceof Element && event.target.closest(".cm-live-code-action") !== null;
  }

  destroy(dom: HTMLElement): void {
    const button = dom.querySelector<HTMLButtonElement>(".cm-live-code-action");
    const pending = button && copyTimers.get(button);
    if (pending) clearTimeout(pending);
  }
}

class FootnoteWidget extends WidgetType {
  constructor(readonly label: string) {
    super();
  }

  eq(other: FootnoteWidget): boolean {
    return this.label === other.label;
  }

  toDOM(): HTMLElement {
    const reference = document.createElement("sup");
    reference.className = "cm-live-footnote";
    reference.textContent = this.label;
    reference.setAttribute("aria-label", `Footnote ${this.label}`);
    reference.title = `Footnote ${this.label}`;
    return reference;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

class TaskWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    readonly readOnly: boolean,
  ) {
    super();
  }

  eq(other: TaskWidget): boolean {
    return this.checked === other.checked && this.readOnly === other.readOnly;
  }

  toDOM(view: EditorView): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-live-task";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = this.checked;
    input.setAttribute("aria-label", this.checked ? "Mark task incomplete" : "Mark task complete");
    if (this.readOnly) {
      input.tabIndex = -1;
      input.setAttribute("aria-disabled", "true");
      input.setAttribute("aria-label", this.checked ? "Completed task" : "Open task");
    }
    input.addEventListener("mousedown", (event) => event.preventDefault());
    input.addEventListener("click", (event) => {
      if (view.state.readOnly) {
        event.preventDefault();
        return;
      }
      const from = view.posAtDOM(span);
      if (!/^\[[ xX]\]$/.test(view.state.sliceDoc(from, from + 3))) return;
      view.dispatch({
        changes: { from: from + 1, to: from + 2, insert: input.checked ? "x" : " " },
        userEvent: "input",
      });
    });
    span.append(input);
    return span;
  }
}

interface TreeNode {
  name: string;
  parent: TreeNode | null;
}

function listDepth(node: TreeNode): number {
  let depth = 0;
  for (let current: TreeNode | null = node; current; current = current.parent) {
    if (current.name === "ListItem") depth++;
  }
  return depth;
}

function buildDecorations(view: EditorView): {
  decorations: DecorationSet;
  atomicRanges: DecorationSet;
} {
  const ranges: Range<Decoration>[] = [];
  const replacements: Range<Decoration>[] = [];
  const lineClasses = new Map<number, Set<string>>();
  const visited = new Set<string>();
  const { state } = view;
  const selectedLines = state.selection.ranges.map((range) => ({
    from: state.doc.lineAt(range.from).from,
    to: state.doc.lineAt(range.to).to,
  }));

  const isEditing = (from: number, to: number) =>
    view.hasFocus && selectedLines.some((range) => range.from <= to && range.to >= from);

  const addLineClass = (position: number, className: string) => {
    const from = state.doc.lineAt(position).from;
    const classes = lineClasses.get(from) ?? new Set<string>();
    classes.add(className);
    lineClasses.set(from, classes);
  };

  const listDepths = new Map<number, number>();
  const headingLevels = new Map<number, string>();
  const hiddenIndents = new Map<number, number>();
  const hideIndent = (lineFrom: number, to: number) => {
    hiddenIndents.set(lineFrom, Math.max(hiddenIndents.get(lineFrom) ?? lineFrom, to));
  };

  const spacesAfter = (position: number) => {
    const line = state.doc.lineAt(position);
    return position + /^[ \t]*/.exec(state.sliceDoc(position, line.to))![0].length;
  };

  const replace = (from: number, to: number, widget?: WidgetType) => {
    if (from >= to || state.doc.lineAt(from).number !== state.doc.lineAt(to).number) return;
    replacements.push(Decoration.replace({ widget }).range(from, to));
  };

  for (const visible of view.visibleRanges) {
    syntaxTree(state).iterate({
      from: visible.from,
      to: visible.to,
      enter(node) {
        const { from, to, name } = node;
        if (name === "Blockquote") {
          const lastLine = state.doc.lineAt(Math.max(from, to - 1));
          const end = Math.min(lastLine.to, visible.to);
          for (
            let position = state.doc.lineAt(Math.max(from, visible.from)).from;
            position <= end;
          ) {
            const line = state.doc.lineAt(position);
            addLineClass(position, "cm-live-quote");
            position = line.to + 1;
          }
          addLineClass(from, "cm-live-quote-start");
          addLineClass(lastLine.from, "cm-live-quote-end");
        }

        if (name === "FencedCode" || name === "CodeBlock" || name === "Table") {
          const end = Math.min(to, visible.to);
          for (
            let position = state.doc.lineAt(Math.max(from, visible.from)).from;
            position <= end;
          ) {
            const line = state.doc.lineAt(position);
            addLineClass(position, name === "Table" ? "cm-live-table" : "cm-live-codeblock");
            position = line.to + 1;
          }
          if (name === "Table") {
            addLineClass(from, "cm-live-table-start");
            addLineClass(to, "cm-live-table-end");
          } else {
            const firstLine = state.doc.lineAt(from);
            const lastLine = state.doc.lineAt(to);
            addLineClass(from, "cm-live-codeblock-start");
            addLineClass(to, "cm-live-codeblock-end");
            if (name === "FencedCode" && firstLine.number < lastLine.number) {
              addLineClass(firstLine.to + 1, "cm-live-codeblock-body-start");
            }
          }
        }

        const key = `${name}:${from}:${to}`;
        if (visited.has(key)) return;
        visited.add(key);
        const parent = node.node.parent;
        const editing = isEditing(from, to);
        const heading = /^(?:ATX|Setext)Heading([1-6])$/.exec(name);

        if (heading) {
          addLineClass(from, `cm-live-heading cm-live-h${heading[1]}`);
          if (state.readOnly) headingLevels.set(state.doc.lineAt(from).from, heading[1]);
        }

        if (name === "Link" && /^\[\^[^\]\s]+\]$/.test(state.sliceDoc(from, to))) {
          const editingReference =
            view.hasFocus &&
            state.selection.ranges.some((range) => range.from <= to && range.to >= from);
          if (!editingReference) {
            replace(from, to, new FootnoteWidget(state.sliceDoc(from + 2, to - 1)));
          }
          return false;
        }

        const inlineClass = INLINE_CLASSES[name];
        if (inlineClass && from < to) {
          const link = state.readOnly && (name === "Link" || name === "Autolink");
          ranges.push(
            (link ? READER_LINK : Decoration.mark({ class: inlineClass })).range(from, to),
          );
        }

        if (name === "TableHeader") addLineClass(from, "cm-live-table-header");

        if (name === "QuoteMark") {
          addLineClass(from, "cm-live-quote");
          if (!editing) {
            replace(from, to + (state.sliceDoc(to, to + 1) === " " ? 1 : 0));
          }
        }

        if (name === "ListItem") {
          const first = state.doc.lineAt(from);
          const mark = node.node.getChild("ListMark");
          const column = mark ? spacesAfter(mark.to) - first.from : 0;
          const depth = listDepth(node.node);
          const last = state.doc.lineAt(Math.max(from, to - 1));
          const end = Math.min(last.from, visible.to);
          addLineClass(from, "cm-live-list-item");
          for (let position = Math.max(first.from, visible.from); position <= end;) {
            const line = state.doc.lineAt(position);
            listDepths.set(line.from, Math.max(listDepths.get(line.from) ?? 0, depth));
            if (line.number > first.number) {
              const indent = /^[ \t]*/.exec(line.text)![0].length;
              hideIndent(line.from, line.from + Math.min(indent, column));
            }
            position = line.to + 1;
          }
        }

        if (name === "ListMark") {
          const line = state.doc.lineAt(from);
          const end = spacesAfter(to);
          const marker = state.sliceDoc(from, to);
          const task = /^\[[ xX]\]/.test(state.sliceDoc(end, line.to));
          const kind = /^[-+*]$/.test(marker) ? "bullet" : "number";
          const className = `cm-live-list-marker cm-live-list-${kind}`;
          hideIndent(line.from, from);
          if (editing) {
            ranges.push(Decoration.mark({ class: className }).range(from, end));
          } else if (task) {
            replace(from, end);
          } else {
            replace(from, end, new TextWidget(kind === "bullet" ? "•" : `${marker} `, className));
          }
        }

        if (name === "TaskMarker" && !editing) {
          replace(
            from,
            spacesAfter(to),
            new TaskWidget(
              state.sliceDoc(from + 1, from + 2).toLowerCase() === "x",
              state.readOnly,
            ),
          );
        }

        if (name === "HorizontalRule" && !editing) {
          replace(from, to, new TextWidget("", "cm-live-rule"));
          return false;
        }

        if (name === "Image") {
          const image = editing ? null : readImage(state, node.node);
          if (image) {
            const line = state.doc.lineAt(from);
            const block = state.sliceDoc(line.from, line.to).trim() === state.sliceDoc(from, to);
            replace(from, to, new ImageWidget(image, block));
          } else {
            ranges.push(Decoration.mark({ class: "cm-live-image" }).range(from, to));
          }
          return false;
        }

        // Fences only reveal their markup while the cursor is on that very line, so
        // typing inside the block keeps its header and frame in place.
        if (name === "CodeMark" && parent?.name === "FencedCode") {
          const line = state.doc.lineAt(from);
          const opening = line.number === state.doc.lineAt(parent.from).number;
          addLineClass(from, opening ? "cm-live-fence-open" : "cm-live-fence-close");
          if (!isEditing(line.from, line.to)) {
            addLineClass(from, "cm-live-fence-hidden");
            replace(
              from,
              line.to,
              opening ? new CodeHeaderWidget(state.sliceDoc(to, line.to)) : undefined,
            );
          }
          return;
        }

        if (parent && !isEditing(parent.from, parent.to)) {
          if (name === "HeaderMark") {
            replace(from, to + (state.sliceDoc(to, to + 1) === " " ? 1 : 0));
          } else if (name === "EmphasisMark" || name === "StrikethroughMark") {
            replace(from, to);
          } else if (name === "CodeMark" && parent.name === "InlineCode") {
            replace(from, to);
          } else if (
            (name === "LinkMark" ||
              name === "URL" ||
              name === "LinkTitle" ||
              name === "LinkLabel") &&
            parent.name === "Link"
          ) {
            replace(from, to);
          }
        }
      },
    });
  }

  const inBlock = (from: number) => {
    const classes = lineClasses.get(from);
    return classes?.has("cm-live-codeblock") || classes?.has("cm-live-table");
  };

  for (const [from, to] of hiddenIndents) {
    if (!inBlock(from) && !isEditing(from, to)) replace(from, to);
  }

  for (const from of listDepths.keys()) {
    if (inBlock(from)) continue;
    const classes = lineClasses.get(from) ?? new Set<string>();
    classes.add("cm-live-list");
    lineClasses.set(from, classes);
  }

  for (const [from, classes] of lineClasses) {
    const depth = inBlock(from) ? undefined : listDepths.get(from);
    const level = headingLevels.get(from);
    const attributes: Record<string, string> = {};
    if (depth) attributes.style = `--list-depth: ${depth}`;
    if (level) Object.assign(attributes, { role: "heading", "aria-level": level });
    ranges.push(
      Decoration.line({
        class: [...classes].join(" "),
        attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
      }).range(from),
    );
  }

  return {
    decorations: Decoration.set([...ranges, ...replacements], true),
    atomicRanges: Decoration.set(replacements, true),
  };
}

const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    atomicRanges: DecorationSet;

    constructor(view: EditorView) {
      const result = buildDecorations(view);
      this.decorations = result.decorations;
      this.atomicRanges = result.atomicRanges;
    }

    update(update: ViewUpdate): void {
      if (
        update.docChanged ||
        update.selectionSet ||
        update.viewportChanged ||
        update.focusChanged ||
        update.startState.readOnly !== update.state.readOnly ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
        const result = buildDecorations(update.view);
        this.decorations = result.decorations;
        this.atomicRanges = result.atomicRanges;
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) => view.plugin(plugin)?.atomicRanges ?? Decoration.none),
  },
);

/** Inline markup hiding plus block-level table rendering for the editable preview. */
export const livePreview: Extension = [livePreviewPlugin, liveTables];
