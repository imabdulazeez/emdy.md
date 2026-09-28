import { Show } from "solid-js";
import { hasDocuments } from "~/state/document";
import {
  dismissExportError,
  EXPORT_FORMATS,
  exportActiveDocument,
  exportError,
  type ExportFormat,
  prepareExport,
} from "~/state/export";
import { Icon, type IconName } from "./icons";
import ToolbarMenu, { type ToolbarMenuItem } from "./ToolbarMenu";

export const EXPORT_ICONS: Record<ExportFormat, IconName> = {
  markdown: "file",
  docx: "file-text",
  pdf: "printer",
};

export interface ExportMenuProps {
  onExport?: (format: ExportFormat) => unknown;
  onPrepare?: () => void;
}

export default function ExportMenu(props: ExportMenuProps) {
  const run = (format: ExportFormat) => {
    void (props.onExport ?? exportActiveDocument)(format);
  };
  const prepare = () => {
    if (!hasDocuments()) return;
    try {
      (props.onPrepare ?? prepareExport)();
    } catch {
      return;
    }
  };
  const items: ToolbarMenuItem[] = EXPORT_FORMATS.map((format) => ({
    id: `export-${format.id}`,
    label: format.label,
    icon: EXPORT_ICONS[format.id],
    onSelect: () => run(format.id),
  }));
  return (
    <div class="relative" onPointerEnter={prepare} onFocusIn={prepare}>
      <ToolbarMenu
        label="Export"
        icon="download"
        align="end"
        title="Export document"
        disabled={!hasDocuments()}
        items={items}
      />
      <Show when={exportError()}>
        {(message) => (
          <div
            role="alert"
            data-testid="export-error"
            class="popover absolute top-full right-0 z-40 mt-1.5 flex w-72 items-start gap-1 bg-danger-soft py-1.5 pr-1 pl-2.5 text-[12px] text-text"
          >
            <span class="min-w-0 flex-1 py-0.5">{message()}</span>
            <button
              type="button"
              class="icon-button size-6 min-w-6"
              aria-label="Dismiss"
              onClick={dismissExportError}
            >
              <Icon name="close" size={13} />
            </button>
          </div>
        )}
      </Show>
    </div>
  );
}
