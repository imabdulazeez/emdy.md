import { createSignal, onCleanup, Show } from "solid-js";
import { formatEdited, formatEditedStamp } from "~/lib/recency";
import { activeDocument } from "~/state/document";

const TICK_MS = 30_000;

export default function LastEdited() {
  const [now, setNow] = createSignal(Date.now());
  const timer = setInterval(() => setNow(Date.now()), TICK_MS);
  onCleanup(() => clearInterval(timer));

  const modified = () => activeDocument().modified;

  return (
    <Show when={activeDocument().id !== "" && modified() > 0}>
      <div class="@container min-w-0 flex-1">
        <time
          class="hidden text-[12px] whitespace-nowrap text-text-faint tabular-nums @[8rem]:inline"
          data-testid="last-edited"
          datetime={new Date(modified()).toISOString()}
          title={formatEditedStamp(modified())}
        >
          {formatEdited(modified(), Math.max(now(), modified()))}
        </time>
      </div>
    </Show>
  );
}
