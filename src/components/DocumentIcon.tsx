import { Dynamic } from "@solidjs/web";
import { createEffect, createMemo, For, Match, Switch } from "solid-js";
import {
  automaticDocumentIcon,
  DOCUMENT_ICON_COLOR_CLASSES,
  graphemes,
  type DocumentIcon as DocumentIconData,
  type DocumentIconColor,
} from "~/lib/document-icon";
import type { LucideNode } from "~/lib/lucide-registry";
import { cn } from "~/lib/utils";
import { loadLucideIcon, lucideIcon } from "~/state/lucide";

export interface DocumentIconProps {
  icon: DocumentIconData | null;
  title: string;
  class?: string;
}

export function Monogram(props: { text: string; color: DocumentIconColor }) {
  return (
    <svg
      viewBox="0 0 16 16"
      class={cn(
        "icon-tile size-full overflow-hidden rounded-[25%] select-none",
        DOCUMENT_ICON_COLOR_CLASSES[props.color],
      )}
    >
      <text
        x="8"
        y="10.8"
        text-anchor="middle"
        fill="currentColor"
        font-size="8.25"
        font-weight="700"
        class="font-mono"
        textLength={graphemes(props.text).length === 1 ? 6 : 12}
        lengthAdjust="spacingAndGlyphs"
        text-rendering="geometricPrecision"
      >
        {props.text}
      </text>
    </svg>
  );
}

export function LucideGlyph(props: { node: LucideNode; class?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      class={cn("size-full", props.class)}
    >
      <For each={props.node}>{(part) => <Dynamic component={part[0]} {...part[1]} />}</For>
    </svg>
  );
}

type IconView =
  | { kind: "pending" }
  | { kind: "monogram"; text: string; color: DocumentIconColor }
  | { kind: "emoji"; emoji: string }
  | { kind: "lucide"; node: LucideNode; color: DocumentIconColor };

function pick<K extends IconView["kind"]>(view: IconView, kind: K) {
  return view.kind === kind ? (view as Extract<IconView, { kind: K }>) : false;
}

export default function DocumentIcon(props: DocumentIconProps) {
  const requested = createMemo(() => props.icon ?? automaticDocumentIcon(props.title));
  const view = createMemo((): IconView => {
    const icon = requested();
    if (icon.kind !== "lucide") return icon;
    const node = lucideIcon(icon.name);
    if (node === null) return { kind: "pending" };
    return node ? { kind: "lucide", node, color: icon.color } : automaticDocumentIcon(props.title);
  });

  createEffect(
    () => {
      const icon = requested();
      return icon.kind === "lucide" ? icon.name : null;
    },
    (name) => {
      if (name !== null) void loadLucideIcon(name);
    },
  );

  return (
    <span
      aria-hidden="true"
      data-document-icon={props.icon ? props.icon.kind : "automatic"}
      class={cn(
        "inline-flex size-4 shrink-0 items-center justify-center leading-none [container-type:size]",
        props.class,
      )}
    >
      <Switch>
        <Match when={pick(view(), "monogram")}>
          {(icon) => <Monogram text={icon().text} color={icon().color} />}
        </Match>
        <Match when={pick(view(), "emoji")}>
          {(icon) => <span class="text-[length:84cqh] leading-none">{icon().emoji}</span>}
        </Match>
        <Match when={pick(view(), "lucide")}>
          {(icon) => (
            <LucideGlyph node={icon().node} class={DOCUMENT_ICON_COLOR_CLASSES[icon().color]} />
          )}
        </Match>
      </Switch>
    </span>
  );
}
