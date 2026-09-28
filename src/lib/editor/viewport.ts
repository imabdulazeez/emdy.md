export interface ViewportProbe {
  scrollDOM: HTMLElement;
  posAtCoords(coords: { x: number; y: number }, precise: false): number;
  state: { doc: { lineAt(pos: number): { number: number } } };
}

export const VIEWPORT_PROBE_MARGIN = 4;

export const VIEWPORT_SCROLL_MARGIN = 24;

export function topVisibleLine(view: ViewportProbe, margin = VIEWPORT_PROBE_MARGIN): number {
  const rect = view.scrollDOM.getBoundingClientRect();
  const pos = view.posAtCoords(
    { x: rect.left + margin, y: rect.top + VIEWPORT_SCROLL_MARGIN + margin },
    false,
  );
  return view.state.doc.lineAt(pos).number;
}

export interface LineOffsetProbe {
  scrollDOM: HTMLElement;
  documentTop: number;
  lineBlockAt(pos: number): { top: number };
  domAtPos(pos: number): { node: Node };
  state: { doc: { line(n: number): { from: number } } };
}

export function lineOffset(view: LineOffsetProbe, lineNumber: number): number {
  const { from } = view.state.doc.line(lineNumber);
  const { node } = view.domAtPos(from);
  const element = node instanceof Element ? node : node.parentElement;
  const row = element?.closest<HTMLElement>(".cm-line");
  const top = row
    ? row.getBoundingClientRect().top + (parseFloat(getComputedStyle(row).paddingTop) || 0)
    : view.documentTop + view.lineBlockAt(from).top;
  return top - view.scrollDOM.getBoundingClientRect().top;
}

export function blockStartLine(
  doc: { lines: number; line(n: number): { text: string } },
  lineNumber: number,
): number {
  for (let n = lineNumber; n <= doc.lines; n++) if (doc.line(n).text.trim() !== "") return n;
  return lineNumber;
}
