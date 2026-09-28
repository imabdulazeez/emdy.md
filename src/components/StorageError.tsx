import { createSignal, Show } from "solid-js";
import { librarySaveError, retryLibrarySave } from "~/state/library";

export default function StorageError() {
  const [busy, setBusy] = createSignal(false);
  const retry = async () => {
    if (busy()) return;
    setBusy(true);
    try {
      await retryLibrarySave();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Show when={librarySaveError()}>
      {(message) => (
        <div
          role="alert"
          class="flex flex-wrap items-center gap-2 border-b border-border bg-surface-raised px-3 py-2 text-[12px] text-text"
        >
          <span class="flex-1">Couldn’t save your changes. {message()}</span>
          <button type="button" class="button-primary" disabled={busy()} onClick={retry}>
            Retry save
          </button>
        </div>
      )}
    </Show>
  );
}
