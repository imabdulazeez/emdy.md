import { isDocumentId } from "~/lib/route";
import { storageKey } from "~/lib/storage/key-value";
import { createPersistedSignal } from "~/lib/storage/persisted";

export const POSITION_WRITE_DELAY_MS = 300;

export interface DocumentPosition {
  anchor: number;
  head: number;
  line: number;
}

export type PositionMap = Readonly<Record<string, DocumentPosition>>;

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

const lastDocument = createPersistedSignal<string | null>({
  key: storageKey("workspace", "last-document"),
  fallback: null,
  parse: (value): value is string | null =>
    value === null || (typeof value === "string" && isDocumentId(value)),
});

const sidebar = createPersistedSignal<boolean | null>({
  key: storageKey("workspace", "sidebar"),
  fallback: null,
  parse: (value): value is boolean | null => value === null || typeof value === "boolean",
});

const positions = createPersistedSignal<PositionMap>({
  key: storageKey("workspace", "positions"),
  fallback: {},
  parse: isPositionMap,
  writeDelayMs: POSITION_WRITE_DELAY_MS,
});

export const lastDocumentId = lastDocument.value;
export const sidebarPreference = sidebar.value;
export const documentPositions = positions.value;

export function rememberDocument(id: string): void {
  if (lastDocument.peek() !== id) lastDocument.set(id);
}

export function rememberSidebar(open: boolean): void {
  if (sidebar.peek() !== open) sidebar.set(open);
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

export function resetWorkspaceState(): void {
  lastDocument.reset();
  sidebar.reset();
  positions.reset();
}
