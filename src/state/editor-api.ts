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

export { editorApi };

export function registerEditorApi(api: EditorApi | null): void {
  setEditorApiSignal(() => api);
}

export function resetEditorApiState(): void {
  setEditorApiSignal(null);
}
