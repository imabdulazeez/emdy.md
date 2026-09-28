import { createSignal } from "solid-js";
import type { OutlineEntry } from "~/lib/editor/outline";
import { computeStats, type DocumentStats } from "~/lib/stats";

const [stats, setStatsSignal] = createSignal<DocumentStats>({
  words: 0,
  characters: 0,
  readingMinutes: 0,
});
const [outline, setOutlineSignal] = createSignal<OutlineEntry[]>([]);
const [outlineDocumentId, setOutlineDocumentIdSignal] = createSignal<string | null>(null);

export { stats, outline, outlineDocumentId };

export function updateStatsFromText(text: string): void {
  setStatsSignal(computeStats(text));
}

export function setOutline(entries: OutlineEntry[], documentId: string | null = null): void {
  setOutlineSignal(entries);
  setOutlineDocumentIdSignal(documentId);
}

export function resetStatsState(): void {
  setStatsSignal({ words: 0, characters: 0, readingMinutes: 0 });
  setOutlineSignal([]);
  setOutlineDocumentIdSignal(null);
}
