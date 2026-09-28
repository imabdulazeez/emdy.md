import { Facet } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { TableCopyRequest } from "~/lib/table-clipboard";

export type TableCopyHandler = (request: TableCopyRequest) => void;

/**
 * Where table widgets send a request to open the copy menu. The editor
 * component provides it and renders the menu; without a provider the copy
 * controls do nothing.
 */
export const tableCopyHandler = Facet.define<TableCopyHandler, TableCopyHandler | null>({
  combine: (handlers) => handlers[0] ?? null,
});

export function requestTableCopy(view: EditorView, request: TableCopyRequest): boolean {
  const handler = view.state.facet(tableCopyHandler);
  if (!handler) return false;
  handler(request);
  return true;
}

const PREFIX_CHARS = /^[ \t>]*/;

/**
 * Removes the block prefix (`> ` of a blockquote, a list item's indent) from a
 * table's lines. `prefix` is how far the table starts into its first line;
 * later lines lose at most that many whitespace and `>` characters, so a lazy
 * `>|` continuation keeps its pipe.
 */
export function stripTablePrefix(source: string, prefix: number): string {
  if (prefix <= 0) return source;
  return source
    .split("\n")
    .map((line, index) => {
      if (index === 0) return line.slice(prefix);
      const run = PREFIX_CHARS.exec(line)?.[0].length ?? 0;
      return line.slice(Math.min(prefix, run));
    })
    .join("\n");
}
