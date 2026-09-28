import { isolateHistory } from "@codemirror/commands";
import type { EditorState, StateEffect, Text } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { debounce } from "~/lib/debounce";

export const EDITOR_SESSION_LIMIT = 8;

export interface EditorSessionOptions {
  view: EditorView;
  documentId: string;
  revision: number;
  createState: (text: string) => EditorState;
  save: (id: string, text: string) => void;
  saveDelayMs: number;
  limit?: number;
}

interface StoredSession {
  state: EditorState;
  revision: number;
  scroll: StateEffect<unknown>;
}

export interface EditorSession {
  documentId(): string;
  open(id: string, text: string, revision: number): boolean;
  replaceText(id: string, text: string, revision: number): void;
  noteChange(doc: Text): void;
  flush(): void;
  retain(ids: Iterable<string>): void;
  dispose(): void;
}

export function createEditorSession(options: EditorSessionOptions): EditorSession {
  const { view, createState, save, limit = EDITOR_SESSION_LIMIT } = options;
  const stored = new Map<string, StoredSession>();
  let current = options.documentId;
  let revision = options.revision;
  const snapshot = debounce(
    (id: string, doc: Text) => save(id, doc.toString()),
    options.saveDelayMs,
  );

  return {
    documentId: () => current,
    open(id, text, nextRevision) {
      if (id === current) return false;
      snapshot.flush();
      const restored = stored.get(id);
      stored.delete(id);
      stored.delete(current);
      stored.set(current, { state: view.state, revision, scroll: view.scrollSnapshot() });
      for (const oldest of stored.keys()) {
        if (stored.size <= limit) break;
        stored.delete(oldest);
      }
      current = id;
      revision = nextRevision;
      if (restored && restored.revision === nextRevision) {
        view.setState(restored.state);
        view.dispatch({ effects: restored.scroll });
        return true;
      }
      view.setState(createState(text));
      return false;
    },
    replaceText(id, text, nextRevision) {
      if (id !== current) {
        stored.delete(id);
        return;
      }
      if (nextRevision === revision) return;
      revision = nextRevision;
      snapshot.cancel();
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
        annotations: isolateHistory.of("full"),
      });
    },
    noteChange(doc) {
      snapshot(current, doc);
    },
    flush() {
      snapshot.flush();
    },
    retain(ids) {
      const keep = new Set(ids);
      for (const id of Array.from(stored.keys())) if (!keep.has(id)) stored.delete(id);
    },
    dispose() {
      snapshot.flush();
      stored.clear();
    },
  };
}
