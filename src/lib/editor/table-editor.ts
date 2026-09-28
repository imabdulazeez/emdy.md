import { syntaxTree } from "@codemirror/language";
import {
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
  type Transaction,
} from "@codemirror/state";
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
} from "@codemirror/view";
import {
  ariaKeyShortcuts,
  isMacPlatform,
  matchesShortcut,
  shortcutKeys,
  shortcutTitle,
} from "~/lib/shortcuts";
import { TABLE_COPY_MENU_ATTR } from "~/lib/table-clipboard";
import { MAX_TABLE_COLUMNS, MAX_TABLE_ROWS } from "./block-commands";
import { requestTableCopy, stripTablePrefix } from "./table-copy";
import {
  cellAt,
  formatTable,
  insertColumn,
  insertRow,
  nextAlign,
  parseTableSource,
  removeColumn,
  removeRow,
  setCell,
  setColumnAlign,
  type ColumnAlign,
  type TableCellRef,
  type TableGrid,
} from "./table-source";

export const setFocused = StateEffect.define<boolean>();

export const focusedField = StateField.define<boolean>({
  create: () => false,
  update(focused, tr) {
    for (const effect of tr.effects) if (effect.is(setFocused)) focused = effect.value;
    return focused;
  },
});

export interface ActiveCell extends TableCellRef {
  /** Start of the table's first line, so the decoration knows which table is open. */
  table: number;
}

export const setActiveCell = StateEffect.define<ActiveCell | null>();

export const activeCellField = StateField.define<ActiveCell | null>({
  create: () => null,
  update(active, tr) {
    // Any deliberate selection move closes the grid unless the same transaction
    // reopens it; cell edits never set a selection, so typing keeps it open.
    let next =
      active && !tr.selection ? { ...active, table: tr.changes.mapPos(active.table, -1) } : null;
    for (const effect of tr.effects) if (effect.is(setActiveCell)) next = effect.value;
    return next;
  },
});

export function sameCell(a: ActiveCell | null, b: ActiveCell | null): boolean {
  return a === b || (!!a && !!b && a.table === b.table && a.row === b.row && a.column === b.column);
}

export interface TableRange {
  from: number;
  to: number;
}

/** Full-line range of the table containing `pos`, or null when there is none. */
export function tableRangeAt(state: EditorState, pos: number): TableRange | null {
  let node = syntaxTree(state).resolveInner(Math.min(pos, state.doc.length), 1);
  while (node.name !== "Table") {
    if (!node.parent) return null;
    node = node.parent;
  }
  return { from: state.doc.lineAt(node.from).from, to: state.doc.lineAt(node.to).to };
}

const ALIGN_LABELS: Record<string, string> = {
  default: "default",
  left: "left",
  center: "center",
  right: "right",
};

function alignLabel(align: ColumnAlign): string {
  return ALIGN_LABELS[align ?? "default"];
}

function cellLabel(row: number, column: number): string {
  return row === 0 ? `Column ${column + 1} heading` : `Row ${row}, column ${column + 1}`;
}

interface Action {
  key: string;
  label: string;
  title: string;
  apply: (grid: TableGrid, cell: TableCellRef) => { grid: TableGrid; focus: TableCellRef };
  enabled: (grid: TableGrid, cell: TableCellRef) => boolean;
}

const ACTIONS: readonly Action[] = [
  {
    key: "row-after",
    label: "+ Row",
    title: "Insert row below",
    apply: (grid, cell) => ({
      grid: insertRow(grid, cell.row),
      focus: { row: cell.row + 1, column: cell.column },
    }),
    enabled: (grid) => grid.rows.length + 1 < MAX_TABLE_ROWS,
  },
  {
    key: "row-remove",
    label: "− Row",
    title: "Delete row",
    apply: (grid, cell) => ({
      grid: removeRow(grid, cell.row),
      focus: { row: Math.min(cell.row, grid.rows.length - 1), column: cell.column },
    }),
    enabled: (grid, cell) => cell.row > 0,
  },
  {
    key: "column-after",
    label: "+ Column",
    title: "Insert column to the right",
    apply: (grid, cell) => ({
      grid: insertColumn(grid, cell.column + 1),
      focus: { row: cell.row, column: cell.column + 1 },
    }),
    enabled: (grid) => grid.header.length < MAX_TABLE_COLUMNS,
  },
  {
    key: "column-remove",
    label: "− Column",
    title: "Delete column",
    apply: (grid, cell) => ({
      grid: removeColumn(grid, cell.column),
      focus: { row: cell.row, column: Math.max(0, cell.column - 1) },
    }),
    enabled: (grid) => grid.header.length > 1,
  },
  {
    key: "align",
    label: "Align",
    title: "Change column alignment",
    apply: (grid, cell) => ({
      grid: setColumnAlign(grid, cell.column, nextAlign(grid.align[cell.column])),
      focus: cell,
    }),
    enabled: () => true,
  },
];

function button(action: Action): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "cm-table-editor-action";
  element.dataset.action = action.key;
  element.textContent = action.label;
  element.title = action.title;
  return element;
}

const COPY_TITLE = "Copy table as Markdown or CSV";

/** Opens the copy menu from the grid's toolbar; focus stays in the cell until the menu takes it. */
function copyButton(view: EditorView, wrapper: HTMLElement): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "cm-table-editor-action";
  element.dataset.copy = "true";
  element.textContent = "Copy";
  const mac = isMacPlatform();
  element.title = shortcutTitle(COPY_TITLE, shortcutKeys("copy-table"), mac);
  element.setAttribute("aria-label", COPY_TITLE);
  element.setAttribute("aria-keyshortcuts", ariaKeyShortcuts(shortcutKeys("copy-table"), mac));
  element.setAttribute("aria-haspopup", "menu");
  element.setAttribute("aria-expanded", "false");
  element.addEventListener("mousedown", (event) => event.preventDefault());
  element.addEventListener("click", () => openGridCopyMenu(view, wrapper));
  return element;
}

/** Closes a grid whose copy menu was dismissed by a click that took focus elsewhere. */
function closeAbandonedGrid(view: EditorView, wrapper: HTMLElement): void {
  setTimeout(() => {
    if (!wrapper.isConnected || view.hasFocus) return;
    const active = wrapper.ownerDocument.activeElement;
    if (active && wrapper.contains(active)) return;
    if (view.state.field(activeCellField, false)) {
      view.dispatch({ effects: setActiveCell.of(null) });
    }
  });
}

/** Asks the editor to open the copy menu for the grid in `wrapper`, returning focus to its cell. */
function openGridCopyMenu(view: EditorView, wrapper: HTMLElement): boolean {
  const range = tableRangeAt(view.state, view.posAtDOM(wrapper));
  const anchor = wrapper.querySelector<HTMLButtonElement>("[data-copy]");
  if (!range || !anchor) return false;
  const focused = wrapper.ownerDocument.activeElement;
  const cell = focused instanceof HTMLInputElement && wrapper.contains(focused) ? focused : null;
  return requestTableCopy(view, {
    grid: parseTableSource(view.state.sliceDoc(range.from, range.to)),
    anchor,
    restoreFocus: () => {
      if (cell?.isConnected) cell.focus();
      else if (anchor.isConnected) anchor.focus();
      else view.focus();
    },
    onDismiss: () => closeAbandonedGrid(view, wrapper),
  });
}

function inputFor(grid: TableGrid, row: number, column: number, value: string): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "cm-table-editor-input";
  input.value = value;
  input.dataset.row = String(row);
  input.dataset.column = String(column);
  input.spellcheck = true;
  input.setAttribute("aria-label", cellLabel(row, column));
  input.setAttribute("autocapitalize", "off");
  if (grid.align[column]) input.dataset.align = grid.align[column] as string;
  return input;
}

function inputAt(root: HTMLElement, cell: TableCellRef): HTMLInputElement | null {
  const exact = root.querySelector<HTMLInputElement>(
    `input[data-row="${cell.row}"][data-column="${cell.column}"]`,
  );
  if (exact) return exact;
  const inputs = [...root.querySelectorAll<HTMLInputElement>("input[data-row]")];
  return inputs.at(-1) ?? null;
}

function focusInput(input: HTMLInputElement | null, caret: "start" | "end" = "end"): void {
  if (!input) return;
  input.focus();
  const at = caret === "start" ? 0 : input.value.length;
  input.setSelectionRange(at, at);
}

/**
 * Editable grid shown in place of a table's Markdown while it is being edited.
 * Every change is written straight back to the document as normalized pipe
 * Markdown, so the source stays canonical and the rendered table takes over
 * again as soon as the grid loses focus.
 */
export class TableEditorWidget extends WidgetType {
  constructor(
    readonly source: string,
    private readonly entry: TableCellRef,
  ) {
    super();
  }

  eq(other: TableEditorWidget): boolean {
    return this.source === other.source;
  }

  get estimatedHeight(): number {
    return (this.source.split("\n").length - 1) * 34 + 52;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement("div");
    wrapper.className = "cm-table-editor";
    wrapper.setAttribute("role", "group");
    wrapper.setAttribute("aria-label", "Table editor");

    const scroller = document.createElement("div");
    scroller.className = "cm-table-editor-grid";
    scroller.append(this.buildTable(view, wrapper, parseTableSource(this.source)));

    const actions = document.createElement("div");
    actions.className = "cm-table-editor-actions";
    actions.setAttribute("role", "toolbar");
    actions.setAttribute("aria-label", "Table actions");
    for (const action of ACTIONS) {
      const element = button(action);
      element.addEventListener("mousedown", (event) => event.preventDefault());
      element.addEventListener("click", () => this.runAction(view, wrapper, action));
      actions.append(element);
    }
    actions.append(copyButton(view, wrapper));

    wrapper.append(scroller, actions);
    wrapper.addEventListener("focusout", (event) => this.onFocusOut(view, wrapper, event));

    queueMicrotask(() => {
      if (!wrapper.isConnected) return;
      const active = wrapper.ownerDocument.activeElement;
      if (active && wrapper.contains(active)) return;
      this.activate(view, wrapper, this.entry);
      focusInput(inputAt(wrapper, this.entry));
      this.normalize(view, wrapper);
    });
    return wrapper;
  }

  updateDOM(dom: HTMLElement, view: EditorView): boolean {
    const grid = parseTableSource(this.source);
    const rows = [...dom.querySelectorAll<HTMLTableRowElement>("tr")];
    if (rows.length !== grid.rows.length + 1) return false;
    const active = dom.ownerDocument.activeElement;
    for (const [index, row] of rows.entries()) {
      const cells = grid.rows[index - 1] ?? grid.header;
      const inputs = [...row.querySelectorAll<HTMLInputElement>("input[data-row]")];
      if (inputs.length !== grid.header.length) return false;
      for (const [column, input] of inputs.entries()) {
        const align = grid.align[column];
        if (align) input.dataset.align = align;
        else delete input.dataset.align;
        if (input !== active) input.value = cells[column] ?? "";
      }
    }
    this.syncActions(view.state.field(activeCellField, false) ?? null, grid, dom);
    return true;
  }

  ignoreEvent(): boolean {
    return true;
  }

  private buildTable(view: EditorView, wrapper: HTMLElement, grid: TableGrid): HTMLTableElement {
    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const tbody = document.createElement("tbody");

    const buildRow = (cells: string[], row: number): HTMLTableRowElement => {
      const tr = document.createElement("tr");
      for (const [column, value] of cells.entries()) {
        const container = document.createElement(row === 0 ? "th" : "td");
        const input = inputFor(grid, row, column, value);
        input.addEventListener("input", () => this.onInput(view, wrapper, input));
        input.addEventListener("focus", () =>
          this.activate(view, wrapper, {
            row: Number(input.dataset.row),
            column: Number(input.dataset.column),
          }),
        );
        input.addEventListener("keydown", (event) => this.onKeyDown(view, wrapper, input, event));
        container.append(input);
        tr.append(container);
      }
      return tr;
    };

    thead.append(buildRow(grid.header, 0));
    for (const [index, cells] of grid.rows.entries()) tbody.append(buildRow(cells, index + 1));
    table.append(thead, tbody);
    return table;
  }

  /** Reads the table's live range and grid; both shift as the document changes. */
  private current(
    view: EditorView,
    wrapper: HTMLElement,
  ): { range: TableRange; grid: TableGrid } | null {
    const range = tableRangeAt(view.state, view.posAtDOM(wrapper));
    if (!range) return null;
    return { range, grid: parseTableSource(view.state.sliceDoc(range.from, range.to)) };
  }

  /**
   * Rewrites a hand-aligned table as evenly padded Markdown once, when the grid
   * opens, so closing it always leaves a tidy source behind.
   */
  private normalize(view: EditorView, wrapper: HTMLElement): void {
    const state = this.current(view, wrapper);
    if (!state) return;
    const source = view.state.sliceDoc(state.range.from, state.range.to);
    if (formatTable(state.grid) === source) return;
    this.write(view, state.range, state.grid);
  }

  private write(view: EditorView, range: TableRange, grid: TableGrid): void {
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: formatTable(grid) },
      userEvent: "input",
    });
  }

  private activate(view: EditorView, wrapper: HTMLElement, cell: TableCellRef): void {
    const state = this.current(view, wrapper);
    if (!state) return;
    const next: ActiveCell = { table: state.range.from, row: cell.row, column: cell.column };
    if (!sameCell(view.state.field(activeCellField, false) ?? null, next)) {
      view.dispatch({ effects: setActiveCell.of(next) });
    }
    this.syncActions(next, state.grid, wrapper);
  }

  private onInput(view: EditorView, wrapper: HTMLElement, input: HTMLInputElement): void {
    const state = this.current(view, wrapper);
    if (!state) return;
    const row = Number(input.dataset.row);
    const column = Number(input.dataset.column);
    this.write(view, state.range, setCell(state.grid, row, column, input.value));
  }

  private runAction(view: EditorView, wrapper: HTMLElement, action: Action): void {
    const state = this.current(view, wrapper);
    const cell = view.state.field(activeCellField, false);
    if (!state || !cell || !action.enabled(state.grid, cell)) return;
    const result = action.apply(state.grid, cell);
    this.write(view, state.range, result.grid);
    this.moveTo(view, result.focus);
  }

  /** Focuses a cell after a change that may have rebuilt the grid's DOM. */
  private moveTo(view: EditorView, cell: TableCellRef): void {
    const root = view.dom.querySelector<HTMLElement>(".cm-table-editor");
    if (!root) return;
    const input = inputAt(root, cell);
    if (!input) return;
    this.activate(view, root, {
      row: Number(input.dataset.row),
      column: Number(input.dataset.column),
    });
    focusInput(input);
  }

  private step(view: EditorView, wrapper: HTMLElement, delta: number): void {
    const state = this.current(view, wrapper);
    const cell = view.state.field(activeCellField, false);
    if (!state || !cell) return;
    const columns = state.grid.header.length;
    const flat = cell.row * columns + cell.column + delta;
    if (flat < 0) return;
    const rows = state.grid.rows.length + 1;
    if (flat >= rows * columns) {
      if (state.grid.rows.length + 1 >= MAX_TABLE_ROWS) return;
      this.write(view, state.range, insertRow(state.grid, rows - 1));
      this.moveTo(view, { row: rows, column: flat % columns });
      return;
    }
    this.moveTo(view, { row: Math.floor(flat / columns), column: flat % columns });
  }

  private exit(view: EditorView, wrapper: HTMLElement, side: -1 | 1): void {
    const range = tableRangeAt(view.state, view.posAtDOM(wrapper));
    const anchor = !range
      ? view.state.selection.main.head
      : side < 0
        ? Math.max(0, range.from - 1)
        : Math.min(view.state.doc.length, range.to + 1);
    view.dispatch({
      selection: { anchor },
      effects: setActiveCell.of(null),
      scrollIntoView: true,
    });
    view.focus();
  }

  private onFocusOut(view: EditorView, wrapper: HTMLElement, event: FocusEvent): void {
    if (!wrapper.isConnected) return;
    const next = event.relatedTarget;
    if (next instanceof Node && wrapper.contains(next)) return;
    queueMicrotask(() => {
      const document_ = wrapper.ownerDocument;
      const active = document_.activeElement;
      // A disconnected wrapper means the grid was redrawn, and focus on <body>
      // means the whole window lost focus; neither closes the editor.
      if (!wrapper.isConnected || (active && wrapper.contains(active)) || active === document_.body)
        return;
      // The grid's own copy menu holds focus outside the widget while it is open.
      if (active?.closest(`[${TABLE_COPY_MENU_ATTR}]`)) return;
      if (view.state.field(activeCellField, false)) {
        view.dispatch({ effects: setActiveCell.of(null) });
      }
    });
  }

  private syncActions(
    cell: ActiveCell | TableCellRef | null,
    grid: TableGrid,
    root: HTMLElement,
  ): void {
    for (const element of root.querySelectorAll<HTMLButtonElement>("[data-action]")) {
      const action = ACTIONS.find((candidate) => candidate.key === element.dataset.action);
      if (!action) continue;
      element.disabled = !cell || !action.enabled(grid, cell);
      if (action.key !== "align") continue;
      const align = alignLabel(cell ? grid.align[cell.column] : null);
      element.title = `Column alignment: ${align}`;
      element.setAttribute("aria-label", `Column alignment: ${align}. Change alignment`);
    }
  }

  private onKeyDown(
    view: EditorView,
    wrapper: HTMLElement,
    input: HTMLInputElement,
    event: KeyboardEvent,
  ): void {
    const row = Number(input.dataset.row);
    const caret = input.selectionStart ?? 0;
    const collapsed = caret === (input.selectionEnd ?? 0);
    const stop = () => {
      event.preventDefault();
      event.stopPropagation();
    };
    switch (event.key) {
      case "Tab":
        stop();
        return this.step(view, wrapper, event.shiftKey ? -1 : 1);
      case "Enter": {
        stop();
        const columns = [...wrapper.querySelectorAll("thead input")].length;
        return this.step(view, wrapper, columns);
      }
      case "Escape":
        stop();
        return this.exit(view, wrapper, 1);
      case "ArrowUp": {
        stop();
        const columns = [...wrapper.querySelectorAll("thead input")].length;
        if (row === 0) return this.exit(view, wrapper, -1);
        return this.step(view, wrapper, -columns);
      }
      case "ArrowDown": {
        stop();
        const columns = [...wrapper.querySelectorAll("thead input")].length;
        const last = [...wrapper.querySelectorAll("tbody tr")].length;
        if (row === last) return this.exit(view, wrapper, 1);
        return this.step(view, wrapper, columns);
      }
      case "ArrowLeft":
        if (caret === 0 && collapsed) {
          stop();
          return this.step(view, wrapper, -1);
        }
        return;
      case "ArrowRight":
        if (caret === input.value.length && collapsed) {
          stop();
          return this.step(view, wrapper, 1);
        }
        return;
      default:
        return;
    }
  }
}

/** Cell the grid should open at, from the active cell or the document selection. */
export function entryCell(
  state: EditorState,
  range: TableRange,
  active: ActiveCell | null,
): TableCellRef {
  if (active && active.table === range.from) return { row: active.row, column: active.column };
  const head = state.selection.main.head;
  const offset = Math.max(0, Math.min(range.to, head) - range.from);
  return cellAt(state.sliceDoc(range.from, range.to), offset);
}

export interface TablePosition extends TableRange {
  /** Start of the table node itself; ahead of `from` when the lines carry a prefix. */
  nodeFrom: number;
}

export interface TableSpan extends TablePosition {
  editing: boolean;
}

const CONTAINER_BLOCKS = new Set([
  "Document",
  "BulletList",
  "OrderedList",
  "ListItem",
  "Blockquote",
]);

export function scanTables(state: EditorState): TablePosition[] {
  const spans: TablePosition[] = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name === "Table") {
        spans.push({
          from: state.doc.lineAt(node.from).from,
          to: state.doc.lineAt(node.to).to,
          nodeFrom: node.from,
        });
        return false;
      }
      return CONTAINER_BLOCKS.has(node.name) ? undefined : false;
    },
  });
  return spans;
}

export const tableSpansField = StateField.define<readonly TablePosition[]>({
  create: scanTables,
  update: (spans, tr) =>
    tr.docChanged || syntaxTree(tr.startState) !== syntaxTree(tr.state)
      ? scanTables(tr.state)
      : spans,
});

export function tableSpans(state: EditorState): readonly TablePosition[] {
  return state.field(tableSpansField, false) ?? scanTables(state);
}

/** The table whose lines contain `pos`, including tables inside blockquotes and lists. */
export function tableSpanAt(state: EditorState, pos: number): TablePosition | null {
  return tableSpans(state).find((span) => span.from <= pos && pos <= span.to) ?? null;
}

/** A table's grid read from its source, with any blockquote or list prefix removed. */
export function gridForSpan(state: EditorState, span: TablePosition): TableGrid {
  const source = state.sliceDoc(span.from, span.to);
  return parseTableSource(stripTablePrefix(source, span.nodeFrom - span.from));
}

export function tableGridAt(state: EditorState, pos: number): TableGrid | null {
  const span = tableSpanAt(state, pos);
  return span ? gridForSpan(state, span) : null;
}

/**
 * Opens the copy menu for the table under the cursor: hung from the grid's Copy
 * button when the grid is open, or at the caret when the table is raw text.
 */
export function openTableCopyAtCursor(view: EditorView): boolean {
  const { state } = view;
  const active = state.field(activeCellField, false) ?? null;
  const head = state.selection.main.head;
  const span = tableSpanAt(state, active?.table ?? head);
  if (!span) return false;
  for (const wrapper of view.contentDOM.querySelectorAll<HTMLElement>(".cm-table-editor")) {
    if (tableRangeAt(state, view.posAtDOM(wrapper))?.from === span.from) {
      return openGridCopyMenu(view, wrapper);
    }
  }
  const caret = view.coordsAtPos(head);
  return requestTableCopy(view, {
    grid: gridForSpan(state, span),
    anchor: view.contentDOM,
    point: caret ? { x: caret.left, y: caret.bottom } : undefined,
    restoreFocus: () => view.focus(),
  });
}

/**
 * Listens on the whole editor rather than through a keymap, because keys typed
 * into the grid's inputs never reach CodeMirror's keymaps.
 */
const tableCopyShortcut = ViewPlugin.define((view) => {
  const mac = isMacPlatform();
  const onKeyDown = (event: KeyboardEvent) => {
    if (!matchesShortcut(event, shortcutKeys("copy-table"), mac) || !openTableCopyAtCursor(view))
      return;
    event.preventDefault();
    event.stopPropagation();
  };
  view.dom.addEventListener("keydown", onKeyDown);
  return { destroy: () => view.dom.removeEventListener("keydown", onKeyDown) };
});

/** Visits every table in the document with the range its decoration covers. */
export function eachTable(state: EditorState, visit: (span: TableSpan) => void): void {
  const focused = state.field(focusedField, false) ?? false;
  const active = state.field(activeCellField, false) ?? null;
  const ranges = state.selection.ranges;
  for (const span of tableSpans(state)) {
    const selected =
      focused && ranges.some((range) => range.from >= span.from && range.to <= span.to);
    visit({ ...span, editing: active?.table === span.from || selected });
  }
}

/** Whether a transaction can change which tables are open or how they look. */
export function tablesChanged(tr: Transaction): boolean {
  return (
    tr.docChanged ||
    !!tr.selection ||
    syntaxTree(tr.startState) !== syntaxTree(tr.state) ||
    tr.effects.some((effect) => effect.is(setFocused) || effect.is(setActiveCell))
  );
}

function buildGridDecorations(state: EditorState): DecorationSet {
  const active = state.field(activeCellField);
  const decorations: ReturnType<Decoration["range"]>[] = [];
  eachTable(state, (span) => {
    // Prefixed tables (inside a blockquote or list item) keep their raw source,
    // since a rewritten grid would drop the prefixes.
    if (!span.editing || span.nodeFrom !== span.from) return;
    const source = state.sliceDoc(span.from, span.to);
    const widget = new TableEditorWidget(source, entryCell(state, span, active));
    decorations.push(Decoration.replace({ widget, block: true }).range(span.from, span.to));
  });
  return Decoration.set(decorations, true);
}

const gridField = StateField.define<DecorationSet>({
  create: buildGridDecorations,
  update: (decorations, tr) =>
    tablesChanged(tr) ? buildGridDecorations(tr.state) : decorations.map(tr.changes),
  provide: (field) => EditorView.decorations.from(field),
});

/** Focus and open-cell tracking, shared by the grid editor and the rendered table. */
export const tableEditingState: Extension = [
  focusedField,
  activeCellField,
  tableSpansField,
  EditorView.focusChangeEffect.of((_state, focusing) => setFocused.of(focusing)),
];

/**
 * Replaces a table's Markdown with an editable grid while it is being edited.
 * Active in both presentations, since raw pipe rows are the hardest thing in
 * the document to edit by hand.
 */
export const tableGridEditor: Extension = [tableEditingState, gridField, tableCopyShortcut];
