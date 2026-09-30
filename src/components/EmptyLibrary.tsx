import { Show } from "solid-js";
import { isDesktop } from "~/lib/desktop/bridge";
import { libraryLocation } from "~/state/desktop";
import { createDocument } from "~/state/document";
import { requestEditorFocus } from "~/state/ui";
import { Icon } from "./icons";
import ImportInput from "./ImportInput";
import ImportStatus from "./ImportStatus";
import { SidebarTrigger } from "./ui/sidebar";

export interface EmptyLibraryProps {
  desktop?: boolean;
}

export default function EmptyLibrary(props: EmptyLibraryProps) {
  let input: HTMLInputElement | undefined;
  const desktop = props.desktop ?? isDesktop();

  const create = () => {
    createDocument();
    requestEditorFocus();
  };

  return (
    <div class="flex min-h-0 flex-1 flex-col" data-testid="empty-library">
      <header
        class="flex h-11 shrink-0 items-center px-2 text-[13px]"
        aria-label="Toolbar"
        data-window-drag
      >
        <SidebarTrigger />
      </header>
      <section
        aria-labelledby="empty-library-title"
        class="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-5 px-6 pb-11 text-[13px] text-text"
      >
        <span
          aria-hidden="true"
          class="grid size-9 place-items-center rounded-[10px] bg-text font-mono text-[16px] font-bold text-surface"
        >
          e
        </span>
        <div class="flex flex-col gap-1.5">
          <h1 id="empty-library-title" class="text-[17px] font-bold tracking-tight">
            Welcome to emdy
          </h1>
          <Show
            when={desktop}
            fallback={
              <p class="text-text-muted">
                A quiet Markdown editor that keeps everything on this device. Your documents are
                plain files in this browser’s storage, and nothing you write ever leaves it.
              </p>
            }
          >
            <p class="text-text-muted" data-testid="empty-library-folder">
              A quiet Markdown editor that keeps everything on this device. Your documents are plain
              Markdown files in the {libraryLocation()?.name ?? "documents"} folder, and nothing you
              write ever leaves it.
            </p>
          </Show>
          <p class="text-text-muted">
            Start with a blank page, or bring documents over from another emdy with an export file.
          </p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button type="button" class="button-primary gap-1.5" onClick={create}>
            <Icon name="plus" size={14} />
            New document
          </button>
          <button type="button" class="button-quiet gap-1.5" onClick={() => input?.click()}>
            <Icon name="upload" size={14} />
            Import documents…
          </button>
          <ImportInput ref={(el) => (input = el)} />
        </div>
        <ImportStatus />
      </section>
    </div>
  );
}
