import { createSignal } from "solid-js";
import { cn } from "~/lib/utils";
import { stats } from "~/state/stats";
import { Icon, type IconName } from "./icons";

const formatter = new Intl.NumberFormat("en-US");
const TRANSITION = "grid-template-columns 220ms ease-out, opacity 160ms ease-out";

type StatId = "words" | "chars";

function track(open: boolean) {
  return {
    "grid-template-columns": open ? "1fr" : "0fr",
    opacity: open ? "1" : "0",
    transition: TRANSITION,
  };
}

function StatItem(props: {
  icon: IconName;
  testId: string;
  label: string;
  value: string;
  expanded: boolean;
  visible: boolean;
  align?: "end";
  class?: string;
  onHover: (hovering: boolean) => void;
}) {
  return (
    <div
      class={cn("grid", props.class)}
      data-testid={props.testId}
      data-expanded={props.expanded ? "true" : "false"}
      data-visible={props.visible ? "true" : "false"}
      style={track(props.visible)}
      onMouseEnter={() => props.onHover(true)}
      onMouseLeave={() => props.onHover(false)}
    >
      <div
        class={cn(
          "flex items-center overflow-hidden whitespace-nowrap",
          props.align === "end" && "justify-end",
        )}
      >
        <Icon name={props.icon} size={12} class="mr-1.5 shrink-0 text-text-faint" />
        <div class="grid" data-label style={track(props.expanded)}>
          <span
            class={cn("overflow-hidden whitespace-nowrap", props.align === "end" && "text-right")}
          >
            <span class="pr-1.5">{props.label}</span>
          </span>
        </div>
        <span data-testid={`${props.testId}-value`}>{props.value}</span>
      </div>
    </div>
  );
}

export default function DocumentStatus() {
  const [hovered, setHovered] = createSignal<StatId | null>(null);
  const onHover = (id: StatId) => (hovering: boolean) => setHovered(hovering ? id : null);

  return (
    <div
      class="pointer-events-auto absolute right-4 bottom-3 z-10 flex h-7 items-center gap-3 rounded-full border border-border bg-glass px-3 text-[11.5px] leading-none text-text-muted backdrop-blur-sm tabular-nums"
      data-testid="document-status"
    >
      <StatItem
        icon="type"
        testId="status-words"
        label="Word count"
        value={formatter.format(stats().words)}
        expanded={hovered() === "words"}
        visible={hovered() !== "chars"}
        onHover={onHover("words")}
      />
      <StatItem
        icon="hash"
        testId="status-chars"
        label="Character count"
        value={formatter.format(stats().characters)}
        expanded={hovered() === "chars"}
        visible={hovered() !== "words"}
        align="end"
        class="ml-auto"
        onHover={onHover("chars")}
      />
    </div>
  );
}
