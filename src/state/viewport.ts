import { createSignal } from "solid-js";

const [viewportLine, setViewportLineSignal] = createSignal(0);
const [anchoredLine, setAnchoredLineSignal] = createSignal(0);

let settledLine: number | null = null;

const normalize = (line: number) => (line > 0 ? Math.floor(line) : 0);

export { anchoredLine, viewportLine };

export function readingViewportLine(): number {
  return anchoredLine() || viewportLine();
}

function releaseAnchor(): void {
  settledLine = null;
  setAnchoredLineSignal(0);
}

export function setViewportLine(line: number): void {
  const next = normalize(line);
  if (anchoredLine()) {
    if (settledLine === null) settledLine = next;
    else if (next !== settledLine) releaseAnchor();
  }
  setViewportLineSignal(next);
}

export function anchorViewportLine(line: number): void {
  settledLine = null;
  setAnchoredLineSignal(normalize(line));
  setViewportLineSignal(normalize(line));
}

export function resetViewportState(): void {
  releaseAnchor();
  setViewportLineSignal(0);
}
