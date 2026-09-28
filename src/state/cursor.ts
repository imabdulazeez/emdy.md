import { createSignal } from "solid-js";

export interface CursorPosition {
  line: number;
  column: number;
}

const [cursor, setCursorSignal] = createSignal<CursorPosition>(
  { line: 1, column: 1 },
  {
    equals: (a, b) => a.line === b.line && a.column === b.column,
  },
);

export { cursor };

export function setCursor(position: CursorPosition): void {
  setCursorSignal(position);
}

export function resetCursorState(): void {
  setCursorSignal({ line: 1, column: 1 });
}
