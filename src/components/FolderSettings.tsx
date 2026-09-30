import { createSignal } from "solid-js";
import { revealLabel, type DesktopBridge } from "~/lib/desktop/bridge";
import { chooseLibraryFolder, libraryLocation, revealLibraryFolder } from "~/state/desktop";
import { Icon } from "./icons";

export interface FolderSettingsProps {
  bridge: DesktopBridge;
}

export default function FolderSettings(props: FolderSettingsProps) {
  const [busy, setBusy] = createSignal(false);

  const change = async () => {
    if (busy()) return;
    setBusy(true);
    try {
      await chooseLibraryFolder(props.bridge);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="flex flex-col gap-3" data-testid="folder-settings">
      <div class="flex items-start gap-3">
        <span
          aria-hidden="true"
          class="grid size-8 shrink-0 place-items-center rounded-[9px] bg-surface-raised text-text-muted"
        >
          <Icon name="folder" size={16} />
        </span>
        <div class="flex min-w-0 flex-col gap-1">
          <p class="font-bold text-text" data-testid="storage-location">
            {libraryLocation()?.name ?? "Documents folder"}
          </p>
          <p
            class="truncate text-text-faint"
            data-testid="storage-path"
            title={libraryLocation()?.path}
          >
            {libraryLocation()?.path ?? "Plain Markdown files on this computer"}
          </p>
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button type="button" class="button-quiet gap-1.5" disabled={busy()} onClick={change}>
          <Icon name="folder" size={14} />
          Change folder…
        </button>
        <button
          type="button"
          class="button-quiet gap-1.5"
          onClick={() => void revealLibraryFolder(props.bridge)}
        >
          <Icon name="arrow-up-right" size={14} />
          {revealLabel(props.bridge.platform)}
        </button>
      </div>
    </div>
  );
}
