import { createMemo } from "solid-js";
import { activeDocumentId, closePane, currentDocumentId, openDocument } from "./document";
import { peekSplitLayout, splitLayout, type SplitLayout } from "./workspace";

export { openInSplit } from "./document";

export type PaneSlot = "a" | "b";

export interface Pane {
  slot: PaneSlot;
  documentId: string;
  active: boolean;
}

const otherSlot = (slot: PaneSlot): PaneSlot => (slot === "a" ? "b" : "a");

function slotShowing(panes: readonly Pane[] | undefined, id: string): PaneSlot | undefined {
  return panes?.find((pane) => pane.documentId === id)?.slot;
}

/**
 * Lays the panes out left to right. A pane keeps its slot while it shows the same
 * document, so the editor behind it (and its undo history) survives a split opening,
 * closing, or changing focus.
 */
export function arrangePanes(
  active: string,
  split: SplitLayout | null,
  previous?: readonly Pane[],
): Pane[] {
  const lead = previous?.[0]?.slot ?? "a";
  if (!split)
    return [{ slot: slotShowing(previous, active) ?? lead, documentId: active, active: true }];
  const left = split.side === "left" ? active : split.other;
  const right = split.side === "left" ? split.other : active;
  const leftSlot = slotShowing(previous, left);
  const rightSlot = slotShowing(previous, right);
  const first = leftSlot ?? (rightSlot ? otherSlot(rightSlot) : lead);
  return [
    { slot: first, documentId: left, active: split.side === "left" },
    { slot: otherSlot(first), documentId: right, active: split.side === "right" },
  ];
}

const panes = createMemo<Pane[]>((previous) =>
  arrangePanes(activeDocumentId(), splitLayout(), previous),
);

const isSplit = () => splitLayout() !== null;

export { panes, isSplit };

/** Whether a document is open in the pane that is not focused. */
export function showsInOtherPane(id: string): boolean {
  return peekSplitLayout()?.other === id;
}

/** Moves focus to the pane showing a document. */
export function focusPane(id: string): boolean {
  if (!id || id === currentDocumentId()) return false;
  return openDocument(id);
}

/** Focuses the pane that is not focused. */
export function switchPane(): boolean {
  const split = peekSplitLayout();
  return split ? openDocument(split.other) : false;
}

/** Leaves split view, keeping the focused document. */
export function closeSplit(): boolean {
  const split = peekSplitLayout();
  return split ? closePane(split.other) : false;
}

export { closePane };
