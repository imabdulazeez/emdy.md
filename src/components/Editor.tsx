import {
  Compartment,
  EditorState,
  Prec,
  Transaction,
  type Extension,
  type StateCommand,
} from "@codemirror/state";
import { EditorView, placeholder } from "@codemirror/view";
import { createEffect, onSettled, untrack } from "solid-js";
import { runWhenIdle } from "~/lib/debounce";
import { createEditorExtensions } from "~/lib/editor/extensions";
import { getActiveFormats } from "~/lib/editor/format-state";
import { livePreview } from "~/lib/editor/live-preview";
import { readOutline } from "~/lib/editor/outline";
import { followLinks, readOnlyPreview } from "~/lib/editor/follow-links";
import { tableCopyHandler } from "~/lib/editor/table-copy";
import { previewRulers, sourceRulers } from "~/lib/editor/rulers";
import { createEditorSession, type EditorSession } from "~/lib/editor/session";
import {
  blockStartLine,
  lineOffset,
  topVisibleLine,
  VIEWPORT_SCROLL_MARGIN,
} from "~/lib/editor/viewport";
import { setCursor } from "~/state/cursor";
import {
  activeDocumentId,
  activeRevision,
  docText,
  documents,
  saveDocumentText,
} from "~/state/document";
import { registerEditorApi } from "~/state/editor-api";
import { resetFormattingState, setActiveFormats } from "~/state/formatting";
import { followLink, mentionSource } from "~/state/links";
import { isEditable, isLivePreview, type LayoutMode } from "~/state/layout";
import { showRulers } from "~/state/rulers";
import { setOutline } from "~/state/stats";
import { editorFocusRequested, takeEditorFocusRequest } from "~/state/ui";
import {
  anchoredLine,
  anchorViewportLine,
  readingViewportLine,
  resetViewportState,
  setViewportLine,
} from "~/state/viewport";
import { documentPosition, savePosition } from "~/state/workspace";
import TableCopyMenu, { createTableCopyMenu } from "./TableCopyMenu";
import "./editor.css";

export const SNAPSHOT_DEBOUNCE_MS = 120;
export const OUTLINE_MAX_ATTEMPTS = 40;
export const REVEAL_SETTLE_FRAMES = 10;
const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);

export interface EditorProps {
  mode?: LayoutMode;
}

export default function SourceEditor(props: EditorProps) {
  let host: HTMLDivElement | undefined;
  let view: EditorView | undefined;
  let session: EditorSession | undefined;
  const copyMenu = createTableCopyMenu();
  const presentation = new Compartment();
  const gutter = new Compartment();
  const mode = () => props.mode ?? "editor";
  const isPreview = () => isLivePreview(mode());
  const isReadOnly = () => !isEditable(mode());
  const writing = placeholder("Start writing…");
  const links = followLinks({
    followLocal: (href) => void followLink(href),
    openExternal: (href) => void window.open(href, "_blank", "noopener,noreferrer"),
  });
  const presentations: Record<LayoutMode, Extension> = {
    editor: writing,
    preview: [livePreview, links, writing],
    reader: [
      livePreview,
      links,
      readOnlyPreview,
      Prec.highest(EditorView.contentAttributes.of({ role: "document", "aria-label": "Preview" })),
    ],
  };
  const rulerExtension = (visible: boolean, preview: boolean) =>
    visible ? (preview ? previewRulers : sourceRulers) : [];
  const syncRulers = (editor: EditorView) => {
    const next = rulerExtension(untrack(showRulers), untrack(isPreview));
    if (gutter.get(editor.state) !== next) editor.dispatch({ effects: gutter.reconfigure(next) });
  };

  let cancelOutline = () => {};
  const publishOutline = (attempt = 0) => {
    cancelOutline();
    cancelOutline = runWhenIdle(() => {
      if (!view) return;
      const { entries, complete } = readOutline(view.state);
      setOutline(entries, session?.documentId() ?? untrack(activeDocumentId));
      if (!complete && attempt < OUTLINE_MAX_ATTEMPTS) publishOutline(attempt + 1);
    });
  };

  const publishSelection = (state: EditorState) => {
    const head = state.selection.main.head;
    const line = state.doc.lineAt(head);
    setCursor({ line: line.number, column: head - line.from + 1 });
    setActiveFormats(getActiveFormats(state));
  };

  const recordSelection = (state: EditorState) => {
    if (!session) return;
    const { anchor, head } = state.selection.main;
    savePosition(session.documentId(), { anchor, head });
  };

  const revealLine = (editor: EditorView, number: number): boolean => {
    const doc = editor.state.doc;
    if (number <= blockStartLine(doc, 1)) {
      if (editor.scrollDOM.scrollTop === 0) return false;
      editor.scrollDOM.scrollTop = 0;
      return true;
    }
    const { from } = doc.line(number);
    const top =
      editor.documentTop +
      editor.lineBlockAt(from).top -
      editor.scrollDOM.getBoundingClientRect().top;
    if (Math.abs(top - VIEWPORT_SCROLL_MARGIN) <= 1) return false;
    editor.dispatch({
      effects: EditorView.scrollIntoView(from, { y: "start", yMargin: VIEWPORT_SCROLL_MARGIN }),
    });
    return true;
  };

  const settleOnLine = (editor: EditorView, number: number, frames = REVEAL_SETTLE_FRAMES) => {
    requestAnimationFrame(() => {
      if (view !== editor || anchoredLine() !== number) return;
      if (revealLine(editor, number)) anchorViewportLine(number);
      if (frames > 1) settleOnLine(editor, number, frames - 1);
    });
  };

  let anchorFrame = 0;
  const keepAnchoredLine = (editor: EditorView) => {
    if (anchorFrame || !anchoredLine()) return;
    anchorFrame = requestAnimationFrame(() => {
      anchorFrame = 0;
      const number = anchoredLine();
      if (view !== editor || !number || number > editor.state.doc.lines) return;
      if (revealLine(editor, number)) anchorViewportLine(number);
    });
  };

  const restorePosition = (editor: EditorView, id: string) => {
    const saved = documentPosition(id);
    if (!saved) return;
    const doc = editor.state.doc;
    const selection = {
      anchor: Math.min(saved.anchor, doc.length),
      head: Math.min(saved.head, doc.length),
    };
    editor.dispatch({ selection });
    if (saved.line <= 0) return;
    const number = Math.min(doc.lines, saved.line);
    revealLine(editor, number);
    anchorViewportLine(number);
    settleOnLine(editor, number);
  };

  const syncPresentation = (editor: EditorView, keepPlace: boolean) => {
    const next = presentations[untrack(mode)];
    if (presentation.get(editor.state) === next) return;
    const effects = [presentation.reconfigure(next)];
    if (!keepPlace) {
      editor.dispatch({ effects });
      return;
    }
    const doc = editor.state.doc;
    const anchor = blockStartLine(doc, topVisibleLine(editor));
    const offset = lineOffset(editor, anchor);
    editor.dispatch({
      effects: [
        ...effects,
        EditorView.scrollIntoView(doc.line(anchor).from, {
          y: "start",
          yMargin: Math.max(0, offset),
        }),
      ],
    });
    requestAnimationFrame(() => {
      if (view !== editor || anchor > editor.state.doc.lines) return;
      editor.scrollDOM.scrollTop += lineOffset(editor, anchor) - offset;
    });
  };

  const createState = (text: string) =>
    EditorState.create({
      doc: text,
      extensions: [
        ...createEditorExtensions({
          onDocChanged: (v) => {
            session?.noteChange(v.state.doc);
            publishOutline();
          },
          onSelectionChanged: (v) => {
            publishSelection(v.state);
            recordSelection(v.state);
          },
          mentions: mentionSource,
        }),
        tableCopyHandler.of(copyMenu.open),
        EditorView.updateListener.of((update) => {
          if (update.heightChanged && !update.docChanged) keepAnchoredLine(update.view);
        }),
        presentation.of(presentations[untrack(mode)]),
        gutter.of(rulerExtension(untrack(showRulers), untrack(isPreview))),
      ],
    });

  onSettled(() => {
    if (!host) return;
    view = new EditorView({ state: createState(untrack(docText)), parent: host });
    const editor = view;
    const opened = createEditorSession({
      view: editor,
      documentId: untrack(activeDocumentId),
      revision: untrack(activeRevision),
      createState,
      save: saveDocumentText,
      saveDelayMs: SNAPSHOT_DEBOUNCE_MS,
    });
    session = opened;
    restorePosition(editor, opened.documentId());
    publishSelection(editor.state);
    publishOutline();

    let frame = 0;
    const reportViewport = () => {
      frame = 0;
      setViewportLine(topVisibleLine(editor));
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(reportViewport);
    };
    const releaseAnchor = () => {
      if (!anchoredLine()) return;
      anchorViewportLine(0);
      setViewportLine(topVisibleLine(editor));
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.target === editor.scrollDOM) releaseAnchor();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (editor.state.readOnly && SCROLL_KEYS.has(event.key)) releaseAnchor();
    };
    editor.scrollDOM.addEventListener("scroll", onScroll, { passive: true });
    editor.scrollDOM.addEventListener("wheel", releaseAnchor, { passive: true });
    editor.scrollDOM.addEventListener("touchstart", releaseAnchor, { passive: true });
    editor.scrollDOM.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);

    registerEditorApi({
      scrollToLine(line) {
        const doc = editor.state.doc;
        const target = doc.line(Math.min(doc.lines, Math.max(1, Math.round(line))));
        editor.dispatch({ selection: { anchor: target.from } });
        revealLine(editor, target.number);
        settleOnLine(editor, target.number);
      },
      focus() {
        editor.focus();
      },
      getText() {
        return editor.state.doc.toString();
      },
      flush() {
        opened.flush();
      },
      runCommand(command: StateCommand) {
        if (editor.state.readOnly) return false;
        editor.focus();
        return command(editor);
      },
      applyEdits(edits) {
        editor.dispatch({
          changes: edits,
          annotations: Transaction.addToHistory.of(false),
        });
      },
    });
    if (takeEditorFocusRequest()) editor.focus();

    return () => {
      opened.dispose();
      cancelOutline();
      if (frame) cancelAnimationFrame(frame);
      if (anchorFrame) cancelAnimationFrame(anchorFrame);
      editor.scrollDOM.removeEventListener("scroll", onScroll);
      editor.scrollDOM.removeEventListener("wheel", releaseAnchor);
      editor.scrollDOM.removeEventListener("touchstart", releaseAnchor);
      editor.scrollDOM.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      resetViewportState();
      registerEditorApi(null);
      resetFormattingState();
      setOutline([]);
      editor.destroy();
      session = undefined;
      view = undefined;
    };
  });

  createEffect(editorFocusRequested, (requested) => {
    if (requested && view && takeEditorFocusRequest()) view.focus();
  });

  createEffect(mode, () => {
    if (!view) return;
    session?.flush();
    syncPresentation(view, true);
  });

  // A copy menu belongs to the table it was opened from; switching view or document drops it.
  createEffect(
    () => ({ mode: props.mode, id: activeDocumentId() }),
    () => {
      copyMenu.close();
    },
    { defer: true },
  );

  createEffect(
    () => ({ visible: showRulers(), preview: isPreview() }),
    () => {
      if (view) syncRulers(view);
    },
    { defer: true },
  );

  createEffect(
    () => ({ id: activeDocumentId(), revision: activeRevision() }),
    ({ id, revision }) => {
      if (!view || !session) return;
      const text = untrack(docText);
      if (id === session.documentId()) {
        session.replaceText(id, text, revision);
        return;
      }
      const restoredSession = session.open(id, text, revision);
      syncPresentation(view, false);
      syncRulers(view);
      resetViewportState();
      if (!restoredSession) {
        view.scrollDOM.scrollTop = 0;
        restorePosition(view, id);
      }
      publishSelection(view.state);
      publishOutline();
    },
    { defer: true },
  );

  createEffect(
    () => documents().map((doc) => doc.id),
    (ids) => session?.retain(ids),
    { defer: true },
  );

  createEffect(readingViewportLine, (line) => {
    if (line > 0 && session) savePosition(session.documentId(), { line });
  });

  return (
    <section class="editor-workspace flex h-full min-h-0 flex-col" aria-label="Markdown workspace">
      <p id="editor-mode-hint" class="sr-only">
        {isReadOnly()
          ? "Read-only preview. The document cannot be changed here."
          : isPreview()
            ? "Editable preview. Markdown syntax appears on the line you are writing."
            : "Raw Markdown. Every Markdown marker is visible."}
      </p>
      <div
        class="editor-host min-h-0 flex-1"
        data-editor-mode={isPreview() ? "preview" : "source"}
        data-readonly={isReadOnly() ? "true" : undefined}
        data-rulers={showRulers() ? "true" : "false"}
        data-testid="editor"
        ref={(el) => (host = el)}
      />
      <TableCopyMenu request={copyMenu.request()} onClose={copyMenu.close} />
    </section>
  );
}
