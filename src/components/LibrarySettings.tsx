import { downloadLibrary } from "~/state/library";
import { Icon } from "./icons";
import ImportInput from "./ImportInput";
import ImportStatus from "./ImportStatus";

export default function LibrarySettings() {
  let input: HTMLInputElement | undefined;

  return (
    <div class="flex flex-col gap-3" data-testid="library-settings">
      <div class="flex flex-wrap items-center gap-2">
        <button type="button" class="button-quiet gap-1.5" onClick={() => input?.click()}>
          <Icon name="upload" size={14} />
          Import documents…
        </button>
        <button type="button" class="button-quiet gap-1.5" onClick={() => void downloadLibrary()}>
          <Icon name="download" size={14} />
          Export all documents
        </button>
        <ImportInput ref={(el) => (input = el)} />
      </div>
      <ImportStatus />
    </div>
  );
}
