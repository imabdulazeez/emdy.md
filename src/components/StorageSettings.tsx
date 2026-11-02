import { createSignal, onSettled, Show } from "solid-js";
import { desktopBridge, type DesktopBridge } from "~/lib/desktop/bridge";
import { formatBytes, storageUsage, type StorageUsage } from "~/lib/storage/estimate";
import FolderSettings from "./FolderSettings";
import { Icon } from "./icons";

export interface StorageSettingsProps {
  usage?: () => Promise<StorageUsage | null>;
  bridge?: DesktopBridge | null;
}

function BrowserStorage(props: Pick<StorageSettingsProps, "usage">) {
  const [usage, setUsage] = createSignal<StorageUsage | null>(null);

  onSettled(() => {
    void (async () => {
      const read = props.usage ?? storageUsage;
      setUsage(await read());
    })();
  });

  return (
    <div class="flex items-start gap-3" data-testid="storage-settings">
      <span
        aria-hidden="true"
        class="grid size-8 shrink-0 place-items-center rounded-[9px] bg-surface-raised text-text-muted"
      >
        <Icon name="monitor" size={16} />
      </span>
      <div class="flex min-w-0 flex-col gap-1">
        <p class="font-bold text-text" data-testid="storage-location">
          This browser
        </p>
        <Show when={usage()}>
          {(current) => (
            <p class="text-text-faint" data-testid="storage-usage">
              {formatBytes(current().usage)} used
            </p>
          )}
        </Show>
      </div>
    </div>
  );
}

export default function StorageSettings(props: StorageSettingsProps) {
  const bridge = props.bridge === undefined ? desktopBridge() : props.bridge;
  return (
    <Show when={bridge} fallback={<BrowserStorage usage={props.usage} />}>
      {(current) => <FolderSettings bridge={current()} />}
    </Show>
  );
}
