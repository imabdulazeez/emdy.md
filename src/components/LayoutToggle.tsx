import { LAYOUT_SHORTCUTS } from "~/lib/shortcuts";
import {
  LAYOUT_LABELS,
  LAYOUT_MODES,
  layoutMode,
  setLayoutMode,
  type LayoutMode,
} from "~/state/layout";
import type { IconName } from "./icons";
import ToolbarMenu, { type ToolbarMenuItem } from "./ToolbarMenu";

const ICONS: Record<LayoutMode, IconName> = {
  editor: "editor",
  preview: "preview",
  reader: "book",
};

export default function LayoutToggle() {
  const items: ToolbarMenuItem[] = LAYOUT_MODES.map((mode) => ({
    id: mode,
    label: LAYOUT_LABELS[mode],
    icon: ICONS[mode],
    keys: LAYOUT_SHORTCUTS[mode],
    checked: () => layoutMode() === mode,
    onSelect: () => setLayoutMode(mode),
  }));

  return (
    <ToolbarMenu
      label="View"
      triggerLabel={`View: ${LAYOUT_LABELS[layoutMode()]}`}
      title="Switch view"
      icon={ICONS[layoutMode()]}
      text={LAYOUT_LABELS[layoutMode()]}
      variant="label"
      radio
      align="start"
      class="shrink-0"
      items={items}
    />
  );
}
