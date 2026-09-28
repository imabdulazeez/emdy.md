import { createSignal, Match, Switch } from "solid-js";
import { libraryStatus, startLibrary } from "~/state/library";
import { Icon } from "./icons";

export default function LibraryGate() {
  const [busy, setBusy] = createSignal(false);
  const retry = async () => {
    if (busy()) return;
    setBusy(true);
    try {
      await startLibrary();
    } finally {
      setBusy(false);
    }
  };
  const status = libraryStatus;

  return (
    <div
      class="flex min-h-0 flex-1 items-center justify-center py-12"
      data-testid="library-gate"
      data-status={status().kind}
      aria-busy={status().kind === "loading" ? "true" : undefined}
    >
      <Switch>
        <Match when={status().kind === "error" && status()}>
          {(state) => (
            <section
              aria-labelledby="library-gate-title"
              class="mx-auto flex w-full max-w-sm flex-col gap-4 px-6 text-[13px] text-text"
            >
              <span
                aria-hidden="true"
                class="grid size-9 place-items-center rounded-[10px] bg-surface-raised text-text-muted"
              >
                <Icon name="folder" size={18} />
              </span>
              <div class="flex flex-col gap-1.5">
                <h2 id="library-gate-title" class="text-[15px] font-bold">
                  Couldn’t open your documents
                </h2>
                <p class="text-text-muted">{(state() as { message: string }).message}</p>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <button type="button" class="button-primary" disabled={busy()} onClick={retry}>
                  Try again
                </button>
              </div>
            </section>
          )}
        </Match>
      </Switch>
    </div>
  );
}
