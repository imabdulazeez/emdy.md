import { definePreference } from "./preferences";

export const LAYOUT_MODES = ["editor", "preview", "reader"] as const;
export type LayoutMode = (typeof LAYOUT_MODES)[number];

export const LAYOUT_LABELS: Record<LayoutMode, string> = {
  editor: "Raw Markdown",
  preview: "Editable preview",
  reader: "Read-only preview",
};

export function isLayoutMode(value: unknown): value is LayoutMode {
  return typeof value === "string" && (LAYOUT_MODES as readonly string[]).includes(value);
}

export const layout = definePreference<LayoutMode>({
  name: "layout",
  label: "View",
  fallback: "editor",
  parse: isLayoutMode,
  control: { kind: "choice", options: LAYOUT_MODES, labels: LAYOUT_LABELS },
});

const layoutMode = layout.value;

export { layoutMode };

export function setLayoutMode(mode: LayoutMode): void {
  layout.set(mode);
}

export function isEditable(mode: LayoutMode): boolean {
  return mode !== "reader";
}

export function isLivePreview(mode: LayoutMode): boolean {
  return mode !== "editor";
}

export function resetLayoutState(): void {
  layout.reset();
}
