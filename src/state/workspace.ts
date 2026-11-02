import { isDocumentId } from "~/lib/route";
import { isSplitRatio, SPLIT_RATIO_DEFAULT } from "~/lib/split-ratio";
import { storageKey } from "~/lib/storage/key-value";
import { createPersistedSignal } from "~/lib/storage/persisted";

export const POSITION_WRITE_DELAY_MS = 300;
export const SPLIT_RATIO_WRITE_DELAY_MS = 200;

export interface DocumentPosition {
  anchor: number;
  head: number;
  line: number;
}

export type PositionMap = Readonly<Record<string, DocumentPosition>>;

export type PinnedList = readonly string[];

const isIndex = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0;

export function isDocumentPosition(value: unknown): value is DocumentPosition {
  if (typeof value !== "object" || value === null) return false;
  const { anchor, head, line } = value as Record<string, unknown>;
  return isIndex(anchor) && isIndex(head) && isIndex(line);
}

function isPositionMap(value: unknown): value is PositionMap {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.entries(value).every(([id, pos]) => isDocumentId(id) && isDocumentPosition(pos));
}

export function isPinnedList(value: unknown): value is PinnedList {
  return (
    Array.isArray(value) &&
    value.every((id) => typeof id === "string" && isDocumentId(id)) &&
    new Set(value).size === value.length
  );
}

export function isFlag(value: unknown): value is boolean {
  return typeof value === "boolean";
}

export type SplitSide = "left" | "right";

export interface SplitLayout {
  other: string;
  side: SplitSide;
}

export function isSplitLayout(value: unknown): value is SplitLayout | null {
  if (value === null) return true;
  if (typeof value !== "object" || Array.isArray(value)) return false;
  const { other, side, ...rest } = value as Record<string, unknown>;
  return (
    Object.keys(rest).length === 0 &&
    typeof other === "string" &&
    isDocumentId(other) &&
    (side === "left" || side === "right")
  );
}

export function sameSplitLayout(a: SplitLayout | null, b: SplitLayout | null): boolean {
  if (a === null || b === null) return a === b;
  return a.other === b.other && a.side === b.side;
}

const lastDocument = createPersistedSignal<string | null>({
  key: storageKey("workspace", "last-document"),
  fallback: null,
  parse: (value): value is string | null =>
    value === null || (typeof value === "string" && isDocumentId(value)),
});

const positions = createPersistedSignal<PositionMap>({
  key: storageKey("workspace", "positions"),
  fallback: {},
  parse: isPositionMap,
  writeDelayMs: POSITION_WRITE_DELAY_MS,
});

const pins = createPersistedSignal<PinnedList>({
  key: storageKey("workspace", "pinned"),
  fallback: [],
  parse: isPinnedList,
});

const otherFolders = createPersistedSignal<boolean>({
  key: storageKey("workspace", "other-folders-collapsed"),
  fallback: false,
  parse: isFlag,
});

const split = createPersistedSignal<SplitLayout | null>({
  key: storageKey("workspace", "split"),
  fallback: null,
  parse: isSplitLayout,
  perTab: true,
});

const ratio = createPersistedSignal<number>({
  key: storageKey("workspace", "split-ratio"),
  fallback: SPLIT_RATIO_DEFAULT,
  parse: isSplitRatio,
  writeDelayMs: SPLIT_RATIO_WRITE_DELAY_MS,
});

export const splitRatio = ratio.value;

export function setSplitRatio(next: number): void {
  if (isSplitRatio(next) && ratio.peek() !== next) ratio.set(next);
}

export const lastDocumentId = lastDocument.value;
export const splitLayout = split.value;

export function peekSplitLayout(): SplitLayout | null {
  return split.peek();
}

export function setSplitLayout(next: SplitLayout | null): void {
  if (next && !isDocumentId(next.other)) return;
  if (!sameSplitLayout(split.peek(), next)) split.set(next);
}
export const otherFoldersCollapsed = otherFolders.value;

export function setOtherFoldersCollapsed(collapsed: boolean): void {
  if (otherFolders.peek() !== collapsed) otherFolders.set(collapsed);
}
export const documentPositions = positions.value;
export const pinnedDocumentIds = pins.value;

export function rememberDocument(id: string): void {
  if (lastDocument.peek() !== id) lastDocument.set(id);
}

export function documentPosition(id: string): DocumentPosition | undefined {
  return positions.peek()[id];
}

export function savePosition(id: string, patch: Partial<DocumentPosition>): void {
  if (!isDocumentId(id)) return;
  const current = documentPosition(id);
  const next: DocumentPosition = { anchor: 0, head: 0, line: 0, ...current, ...patch };
  if (
    current &&
    current.anchor === next.anchor &&
    current.head === next.head &&
    current.line === next.line
  ) {
    return;
  }
  positions.set((map) => ({ ...map, [id]: next }));
}

export function forgetPosition(id: string): void {
  if (!documentPosition(id)) return;
  positions.set((map) => {
    const { [id]: _removed, ...rest } = map;
    return rest;
  });
}

export function retainPositions(ids: Iterable<string>): void {
  const keep = new Set(ids);
  const map = positions.peek();
  if (Object.keys(map).every((id) => keep.has(id))) return;
  positions.set(Object.fromEntries(Object.entries(map).filter(([id]) => keep.has(id))));
}

export function isPinned(id: string): boolean {
  return pins.peek().includes(id);
}

export function pinDocument(id: string): void {
  if (!isDocumentId(id) || isPinned(id)) return;
  pins.set((list) => [...list, id]);
}

export function unpinDocument(id: string): void {
  if (!isPinned(id)) return;
  pins.set((list) => list.filter((pinned) => pinned !== id));
}

export function retainPins(ids: Iterable<string>): void {
  const keep = new Set(ids);
  const list = pins.peek();
  if (list.every((id) => keep.has(id))) return;
  pins.set(list.filter((id) => keep.has(id)));
}

export function resetWorkspaceState(): void {
  lastDocument.reset();
  positions.reset();
  pins.reset();
  otherFolders.reset();
  split.reset();
  ratio.reset();
}
