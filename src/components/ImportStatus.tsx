import { onSettled, Show } from "solid-js";
import { describeImport } from "~/lib/storage/archive";
import { cn } from "~/lib/utils";
import { dismissImportStatus, importStatus, type ImportStatus as Outcome } from "~/state/library";
import { Icon } from "./icons";

export interface ImportStatusProps {
  class?: string;
}

export function describeOutcome(outcome: Outcome): string {
  return outcome.kind === "imported"
    ? describeImport(outcome)
    : `Couldn’t import documents. ${outcome.message}`;
}

export default function ImportStatus(props: ImportStatusProps) {
  onSettled(() => {
    dismissImportStatus();
    return dismissImportStatus;
  });

  return (
    <Show when={importStatus()}>
      {(outcome) => (
        <div
          role={outcome().kind === "error" ? "alert" : "status"}
          data-testid="import-status"
          class={cn(
            "flex items-start gap-1 rounded-[8px] py-1.5 pr-1 pl-2.5 text-[12px] text-text",
            outcome().kind === "error" ? "bg-danger-soft" : "bg-surface-raised",
            props.class,
          )}
        >
          <span class="min-w-0 flex-1 py-0.5">{describeOutcome(outcome())}</span>
          <button
            type="button"
            class="icon-button size-6 min-w-6"
            aria-label="Dismiss"
            onClick={dismissImportStatus}
          >
            <Icon name="close" size={13} />
          </button>
        </div>
      )}
    </Show>
  );
}
