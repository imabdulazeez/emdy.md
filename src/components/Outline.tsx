import { createEffect, For, Show } from "solid-js";
import { nearestScrollTop } from "~/lib/scroll-sync";
import { activeOutlineIndex } from "~/lib/editor/outline";
import { editorApi } from "~/state/editor-api";
import { isEditable, layoutMode } from "~/state/layout";
import { readingLine } from "~/state/navigation";
import { outline } from "~/state/stats";
import { anchorViewportLine } from "~/state/viewport";
import "./outline.css";

export const OUTLINE_FOLLOW_MARGIN = 24;

export default function Outline() {
  let list: HTMLElement | undefined;
  const entries: (HTMLButtonElement | undefined)[] = [];
  const activeIndex = () => activeOutlineIndex(outline(), readingLine());

  createEffect(activeIndex, (index) => {
    const entry = index >= 0 ? entries[index] : undefined;
    if (!list || !entry) return;
    const listTop = list.getBoundingClientRect().top;
    const entryRect = entry.getBoundingClientRect();
    list.scrollTop = nearestScrollTop({
      scrollTop: list.scrollTop,
      viewHeight: list.clientHeight,
      itemTop: entryRect.top - listTop + list.scrollTop,
      itemHeight: entryRect.height,
      margin: OUTLINE_FOLLOW_MARGIN,
    });
  });

  const jumpTo = (line: number) => {
    anchorViewportLine(line);
    editorApi()?.scrollToLine(line);
    if (isEditable(layoutMode())) editorApi()?.focus();
  };

  return (
    <aside aria-label="Contents" class="outline-gutter">
      <nav
        aria-label="Outline"
        class="outline-gutter-list scrollbar-quiet"
        ref={(el) => (list = el)}
      >
        <Show
          when={outline().length > 0}
          fallback={
            <p class="px-2 text-[12px] leading-relaxed text-text-faint">
              Headings will appear here as you write.
            </p>
          }
        >
          <ul class="flex flex-col gap-px">
            <For each={outline()}>
              {(entry, index) => (
                <li>
                  <button
                    type="button"
                    class="outline-entry"
                    style={{ "--outline-depth": entry.level - 1 }}
                    aria-current={activeIndex() === index() ? "location" : undefined}
                    title={entry.text}
                    ref={(el) => (entries[index()] = el)}
                    onClick={() => jumpTo(entry.line)}
                  >
                    <span class="outline-entry-text">{entry.text || "Untitled heading"}</span>
                  </button>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </nav>
    </aside>
  );
}
