import { createMemo, createSignal, Show } from "solid-js";
import {
  clampSplitRatio,
  ratioAtPointer,
  roundRatio,
  SPLIT_RATIO_DEFAULT,
  SPLIT_RATIO_MAX,
  SPLIT_RATIO_MIN,
  SPLIT_RATIO_STEP,
} from "~/lib/split-ratio";
import { cn } from "~/lib/utils";
import { documents } from "~/state/document";
import type { LayoutMode } from "~/state/layout";
import { closePane, focusPane, isSplit, panes, type Pane, type PaneSlot } from "~/state/split";
import { requestPaneFocus } from "~/state/ui";
import { setSplitRatio, splitRatio } from "~/state/workspace";
import DocumentIcon from "./DocumentIcon";
import Editor from "./Editor";
import { Icon } from "./icons";

export interface EditorPanesProps {
  mode: LayoutMode;
}

interface EditorPaneProps {
  pane: Pane;
  order: number;
  share: number;
  split: boolean;
  mode: LayoutMode;
}

function EditorPane(props: EditorPaneProps) {
  const doc = createMemo(() => documents().find((entry) => entry.id === props.pane.documentId));
  const title = () => doc()?.title ?? "";
  const focus = () => {
    if (props.split && !props.pane.active) focusPane(props.pane.documentId);
  };

  return (
    <section
      class={cn(
        "flex min-h-0 min-w-0 flex-1 basis-0 flex-col",
        props.split && "max-md:flex-1!",
        props.split && !props.pane.active && "max-md:hidden",
      )}
      style={{ order: props.order, flex: props.split ? `${props.share} 1 0%` : undefined }}
      aria-label={props.split ? `${title()} pane` : undefined}
      data-pane={props.pane.slot}
      data-pane-active={props.split ? (props.pane.active ? "true" : "false") : undefined}
    >
      <Show when={props.split}>
        <header
          class={cn(
            "relative flex h-8 shrink-0 items-center gap-2 border-b border-border pr-1.5 pl-3 text-[12px] max-md:hidden",
            props.pane.active
              ? "text-text after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-accent"
              : "text-text-faint",
          )}
          onPointerDown={(event) => {
            if (!(event.target as Element).closest("button")) focus();
          }}
        >
          <DocumentIcon icon={doc()?.icon ?? null} title={title()} class="size-3.5 shrink-0" />
          <span class="min-w-0 flex-1 truncate" data-pane-title>
            {title()}
          </span>
          <button
            type="button"
            class="icon-button size-6 min-w-6 text-text-faint"
            aria-label={`Close ${title()} pane`}
            title="Close pane"
            onClick={() => {
              if (closePane(props.pane.documentId)) requestPaneFocus();
            }}
          >
            <Icon name="close" size={13} />
          </button>
        </header>
      </Show>
      <div class="min-h-0 flex-1" onFocusIn={focus} onPointerDown={focus}>
        <Editor mode={props.mode} documentId={props.pane.documentId} active={props.pane.active} />
      </div>
    </section>
  );
}

function PaneDivider(props: { container: () => HTMLElement | undefined }) {
  const [dragging, setDragging] = createSignal(false);
  const width = () => props.container()?.getBoundingClientRect().width ?? 0;
  const apply = (next: number) => setSplitRatio(roundRatio(clampSplitRatio(next, width())));

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(event.pointerId);
    handle.focus();
    setDragging(true);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!dragging()) return;
    const box = props.container()?.getBoundingClientRect();
    if (!box) return;
    setSplitRatio(roundRatio(ratioAtPointer(event.clientX, box.left, box.width)));
  };

  const stop = (event: PointerEvent) => {
    if (!dragging()) return;
    const handle = event.currentTarget as HTMLElement;
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    setDragging(false);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const current = splitRatio();
    const moves: Record<string, number> = {
      ArrowLeft: current - SPLIT_RATIO_STEP,
      ArrowRight: current + SPLIT_RATIO_STEP,
      Home: SPLIT_RATIO_MIN,
      End: SPLIT_RATIO_MAX,
    };
    if (!(event.key in moves) || event.metaKey || event.ctrlKey || event.altKey) return;
    event.preventDefault();
    apply(moves[event.key]);
  };

  return (
    <div
      role="separator"
      tabindex="0"
      aria-orientation="vertical"
      aria-label="Resize panes"
      aria-valuemin={Math.round(SPLIT_RATIO_MIN * 100)}
      aria-valuemax={Math.round(SPLIT_RATIO_MAX * 100)}
      aria-valuenow={Math.round(splitRatio() * 100)}
      aria-valuetext={`Left pane ${Math.round(splitRatio() * 100)}%`}
      title="Drag to resize, double-click to even out"
      data-dragging={dragging() ? "true" : undefined}
      class="relative z-10 w-px shrink-0 cursor-col-resize touch-none bg-border outline-none transition-colors duration-100 select-none before:absolute before:inset-y-0 before:-right-1 before:-left-1 hover:bg-border-strong focus-visible:bg-accent data-[dragging=true]:bg-accent max-md:hidden motion-reduce:transition-none"
      style={{ order: 1 }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={() => setDragging(false)}
      onDblClick={() => apply(SPLIT_RATIO_DEFAULT)}
      onKeyDown={onKeyDown}
    />
  );
}

const SLOTS: readonly PaneSlot[] = ["a", "b"];

export default function EditorPanes(props: EditorPanesProps) {
  let container: HTMLDivElement | undefined;
  const position = (slot: PaneSlot) => panes().findIndex((pane) => pane.slot === slot);
  const share = (slot: PaneSlot) => (position(slot) === 0 ? splitRatio() : 1 - splitRatio());
  return (
    <div
      ref={(el) => (container = el)}
      class="flex h-full min-h-0 min-w-0"
      data-split={isSplit() ? "true" : undefined}
    >
      {SLOTS.map((slot) => (
        <Show when={panes().find((pane) => pane.slot === slot)}>
          {(pane) => (
            <EditorPane
              pane={pane()}
              order={position(slot) * 2}
              share={share(slot)}
              split={isSplit()}
              mode={props.mode}
            />
          )}
        </Show>
      ))}
      <Show when={isSplit()}>
        <PaneDivider container={() => container} />
      </Show>
    </div>
  );
}
