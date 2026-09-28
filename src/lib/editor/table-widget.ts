import { syntaxTree } from "@codemirror/language";
import { StateField, type EditorState, type Extension } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";
import { isExternalHref, isSafeHref, LOCAL_LINK_ATTR } from "~/lib/markdown/href";
import { cleanUrl, linkDestination, linkHref } from "./link-destination";
import { TABLE_COPY_TRIGGER_HTML } from "~/lib/table-clipboard";
import { requestTableCopy } from "./table-copy";
import {
  eachTable,
  setActiveCell,
  setFocused,
  tableGridAt,
  tableGridEditor,
  tablesChanged,
  type ActiveCell,
} from "./table-editor";
import { parseAlignment, type ColumnAlign } from "./table-source";

/** Lezer's node type, reached through CodeMirror so @lezer/common stays an indirect dependency. */
type SyntaxNode = ReturnType<typeof syntaxTree>["topNode"];

interface CellRef {
  /** Offset from the replaced range's start (what `posAtDOM` returns), so clicks map to the live document. */
  offset: number;
  node: SyntaxNode | null;
}

interface TableModel {
  align: ColumnAlign[];
  header: CellRef[];
  rows: CellRef[][];
}

function decodeEntity(text: string): string {
  const decoder = document.createElement("textarea");
  decoder.innerHTML = text;
  return decoder.value;
}

/** Inline rendering context; link reference definitions are collected lazily on first use. */
class RenderContext {
  constructor(readonly state: EditorState) {}

  linkDestination(link: SyntaxNode): string {
    return linkDestination(this.state, link);
  }

  referenceDestinations(node: SyntaxNode): string[] {
    const destinations: string[] = [];
    syntaxTree(this.state).iterate({
      from: node.from,
      to: node.to,
      enter: (child) => {
        if (child.name !== "Link" || child.node.getChild("URL")) return;
        destinations.push(this.linkDestination(child.node));
      },
    });
    return destinations;
  }
}

const SKIPPED_NODES = new Set([
  "EmphasisMark",
  "CodeMark",
  "LinkMark",
  "StrikethroughMark",
  "URL",
  "LinkTitle",
  "LinkLabel",
  "HardBreak",
]);

function cellsOf(row: SyntaxNode, tableFrom: number): CellRef[] {
  const cells: CellRef[] = [];
  for (let child = row.firstChild; child; child = child.nextSibling) {
    if (child.name === "TableCell") cells.push({ offset: child.from - tableFrom, node: child });
  }
  return cells;
}

export function readTable(state: EditorState, table: SyntaxNode, base = table.from): TableModel {
  let header: CellRef[] = [];
  let align: ColumnAlign[] = [];
  const rows: CellRef[][] = [];
  for (let child = table.firstChild; child; child = child.nextSibling) {
    if (child.name === "TableHeader") header = cellsOf(child, base);
    else if (child.name === "TableDelimiter")
      align = parseAlignment(state.sliceDoc(child.from, child.to));
    else if (child.name === "TableRow") rows.push(cellsOf(child, base));
  }
  return { align, header, rows };
}

function appendText(into: HTMLElement, text: string): void {
  if (text) into.append(document.createTextNode(text));
}

/** Renders a cell's inline Markdown (emphasis, code, links, entities) as DOM without markers. */
export function renderInline(ctx: RenderContext, node: SyntaxNode, into: HTMLElement): void {
  const { state } = ctx;
  let position = node.from;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.from > position) appendText(into, state.sliceDoc(position, child.from));
    renderNode(ctx, child, into);
    position = child.to;
  }
  if (position < node.to) appendText(into, state.sliceDoc(position, node.to));
}

function renderNode(ctx: RenderContext, node: SyntaxNode, into: HTMLElement): void {
  if (SKIPPED_NODES.has(node.name)) return;
  const { state } = ctx;
  switch (node.name) {
    case "StrongEmphasis":
      return renderWrapped(ctx, node, into, "strong");
    case "Emphasis":
      return renderWrapped(ctx, node, into, "em");
    case "Strikethrough":
      return renderWrapped(ctx, node, into, "s");
    case "InlineCode":
      return renderWrapped(ctx, node, into, "code");
    case "Escape":
      return appendText(into, state.sliceDoc(node.from + 1, node.to));
    case "Entity":
      return appendText(into, decodeEntity(state.sliceDoc(node.from, node.to)));
    case "Link":
    case "Autolink": {
      const href = linkHref(state, node);
      const anchor = document.createElement("a");
      if (isSafeHref(href) && isExternalHref(href)) {
        anchor.href = href;
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
      } else if (isSafeHref(href)) {
        anchor.setAttribute(LOCAL_LINK_ATTR, href);
        anchor.setAttribute("role", "link");
        anchor.tabIndex = 0;
      }
      if (node.name === "Autolink")
        appendText(anchor, cleanUrl(state.sliceDoc(node.from, node.to)));
      else renderInline(ctx, node, anchor);
      into.append(anchor);
      return;
    }
    default:
      return renderInline(ctx, node, into);
  }
}

function renderWrapped(
  ctx: RenderContext,
  node: SyntaxNode,
  into: HTMLElement,
  tag: "strong" | "em" | "s" | "code",
): void {
  const element = document.createElement(tag);
  renderInline(ctx, node, element);
  into.append(element);
}

/**
 * Renders a GFM table as real HTML while the cursor is elsewhere. Clicking a
 * cell moves the cursor to that cell's source so the table opens for editing.
 */
export class TableWidget extends WidgetType {
  private readonly ctx: RenderContext;
  private references: string | null = null;

  constructor(
    readonly source: string,
    state: EditorState,
    private readonly from: number,
    private readonly rangeFrom: number,
  ) {
    super();
    this.ctx = new RenderContext(state);
  }

  private referenceSignature(): string {
    if (this.references === null) {
      const node = this.tableNode();
      this.references = node ? this.ctx.referenceDestinations(node).join("\n") : "";
    }
    return this.references;
  }

  eq(other: TableWidget): boolean {
    return this.source === other.source && this.referenceSignature() === other.referenceSignature();
  }

  get estimatedHeight(): number {
    return (this.source.split("\n").length - 1) * 36 + 16;
  }

  private tableNode(): SyntaxNode | null {
    let node: SyntaxNode | null = syntaxTree(this.ctx.state).resolveInner(this.from, 1);
    while (node && node.name !== "Table") node = node.parent;
    return node;
  }

  toDOM(view: EditorView): HTMLElement {
    const node = this.tableNode();

    const wrapper = document.createElement("div");
    wrapper.className = "cm-live-table-widget";
    if (!node) return wrapper;

    const model = readTable(this.ctx.state, node, this.rangeFrom);
    const table = document.createElement("table");
    const columns = model.header.length;

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    model.header.forEach((cell, index) =>
      headRow.append(this.cell("th", cell, model.align[index], 0, index)),
    );
    thead.append(headRow);

    const tbody = document.createElement("tbody");
    for (const [rowIndex, row] of model.rows.entries()) {
      const tr = document.createElement("tr");
      for (let index = 0; index < columns; index++) {
        const cell = row[index] ?? { offset: row.at(-1)?.offset ?? 0, node: null };
        tr.append(this.cell("td", cell, model.align[index], rowIndex + 1, index));
      }
      tbody.append(tr);
    }

    table.append(thead, tbody);
    const scroller = document.createElement("div");
    scroller.className = "cm-live-table-scroll";
    scroller.append(table);
    wrapper.classList.add("table-block");
    wrapper.append(this.copyTrigger(view, wrapper), scroller);
    wrapper.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || view.state.readOnly || target.closest("a, .table-tools")) return;
      const cell = target.closest<HTMLElement>("[data-offset]");
      const offset = Number(cell?.dataset.offset ?? 0);
      const start = view.posAtDOM(wrapper);
      const anchor = Math.min(start + offset, view.state.doc.length);
      const active: ActiveCell | null = this.plain
        ? {
            table: start,
            row: Number(cell?.dataset.row ?? 0),
            column: Number(cell?.dataset.column ?? 0),
          }
        : null;
      // CodeMirror reports the focus change a microtask later; carry it here so the
      // grid opens in the same update as the selection.
      view.focus();
      view.dispatch({
        selection: { anchor },
        effects: [setFocused.of(true), setActiveCell.of(active)],
        scrollIntoView: true,
      });
    });
    return wrapper;
  }

  /** The corner button that opens the copy menu; the same markup the read-only preview renders. */
  private copyTrigger(view: EditorView, wrapper: HTMLElement): HTMLElement {
    const tools = document.createElement("template");
    tools.innerHTML = TABLE_COPY_TRIGGER_HTML;
    const element = tools.content.firstElementChild as HTMLElement;
    const trigger = element.querySelector<HTMLButtonElement>("button")!;
    trigger.addEventListener("click", () => {
      const grid = tableGridAt(view.state, view.posAtDOM(wrapper));
      if (grid) requestTableCopy(view, { grid, anchor: trigger });
    });
    return element;
  }

  /** True for a table whose lines carry no block prefix, so a grid can replace it. */
  private get plain(): boolean {
    return this.from === this.rangeFrom;
  }

  private cell(
    tag: "th" | "td",
    ref: CellRef,
    align: ColumnAlign | undefined,
    row: number,
    column: number,
  ): HTMLElement {
    const element = document.createElement(tag);
    element.dataset.offset = String(ref.offset);
    element.dataset.row = String(row);
    element.dataset.column = String(column);
    if (align) element.dataset.align = align;
    if (ref.node) renderInline(this.ctx, ref.node, element);
    return element;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function buildTableDecorations(state: EditorState): DecorationSet {
  const decorations: ReturnType<Decoration["range"]>[] = [];
  eachTable(state, (span) => {
    if (span.editing) return;
    const source = state.sliceDoc(span.from, span.to);
    const widget = new TableWidget(source, state, span.nodeFrom, span.from);
    decorations.push(Decoration.replace({ widget, block: true }).range(span.from, span.to));
  });
  return Decoration.set(decorations, true);
}

const renderedTableField = StateField.define<DecorationSet>({
  create: buildTableDecorations,
  update: (decorations, tr) =>
    tablesChanged(tr) ? buildTableDecorations(tr.state) : decorations.map(tr.changes),
  provide: (field) => EditorView.decorations.from(field),
});

/** Block-level table rendering. Lives in a state field because block widgets cannot come from view plugins. */
export const liveTables: Extension = [tableGridEditor, renderedTableField];
