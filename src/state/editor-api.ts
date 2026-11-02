import type { StateCommand } from "@codemirror/state";
import type { TextEdit } from "~/lib/markdown/document-links";
import { createSignal } from "solid-js";

export interface EditorApi {
  scrollToLine(line: number): void;
  focus(): void;
  getText(): string;
  /** Publishes any pending editor snapshot to the document state immediately. */
  flush(): void;
  /** Focuses the editor and runs a CodeMirror command against it. */
  runCommand(command: StateCommand): boolean;
  /** Applies edits the app makes on the writer's behalf, without focus or an undo step. */
  applyEdits(edits: readonly TextEdit[]): void;
}

const [editorApi, setEditorApiSignal] = createSignal<EditorApi | null>(null);

let registered: EditorApi | null = null;
const liveEditors = new Map<EditorApi, () => string>();

export { editorApi };

export function registerEditorApi(api: EditorApi | null): void {
  registered = api;
  setEditorApiSignal(() => api);
}

export function isFocusedEditor(api: EditorApi): boolean {
  return registered === api;
}

/** Clears the focused editor only when it is still the given one. */
export function releaseEditorApi(api: EditorApi): void {
  if (registered === api) registerEditorApi(null);
}

/** Records a mounted editor and the document it shows, focused or not. */
export function registerLiveEditor(api: EditorApi, documentId: () => string): () => void {
  liveEditors.set(api, documentId);
  return () => {
    liveEditors.delete(api);
  };
}

/** The mounted editor showing a document, if any pane shows it. */
export function liveEditor(id: string): EditorApi | null {
  for (const [api, documentId] of liveEditors) if (documentId() === id) return api;
  return null;
}

/** Publishes every mounted editor's pending snapshot. */
export function flushEditors(): void {
  const all = new Set(liveEditors.keys());
  if (registered) all.add(registered);
  for (const api of all) api.flush();
}

export function resetEditorApiState(): void {
  registered = null;
  liveEditors.clear();
  setEditorApiSignal(null);
}
