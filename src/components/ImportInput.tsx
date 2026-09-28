import { ARCHIVE_MIME_TYPE, ARCHIVE_EXTENSION } from "~/lib/storage/archive";
import { importLibraryFile } from "~/state/library";

export interface ImportInputProps {
  ref?: (input: HTMLInputElement) => void;
  onImport?: (file: File) => Promise<void>;
}

export default function ImportInput(props: ImportInputProps) {
  return (
    <input
      ref={(el) => props.ref?.(el)}
      type="file"
      accept={`${ARCHIVE_EXTENSION},${ARCHIVE_MIME_TYPE}`}
      class="hidden"
      tabindex={-1}
      aria-label="Import documents file"
      data-testid="import-input"
      onChange={(event) => {
        const input = event.currentTarget;
        const file = input.files?.[0];
        input.value = "";
        if (file) void (props.onImport ?? importLibraryFile)(file);
      }}
    />
  );
}
