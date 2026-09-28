import { createEffect, createSignal, createUniqueId, onSettled, Show } from "solid-js";
import { MAX_TABLE_COLUMNS, MAX_TABLE_ROWS, type TableOptions } from "~/lib/editor/block-commands";

export interface TableInsertPanelProps {
  open: boolean;
  onClose: () => void;
  onInsert: (options: TableOptions) => void;
}

const PANEL_DEFAULTS: TableOptions = { rows: 3, columns: 3, header: true };

function clamp(value: number, max: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(max, Math.trunc(value)));
}

export default function TableInsertPanel(props: TableInsertPanelProps) {
  const [rows, setRows] = createSignal(PANEL_DEFAULTS.rows);
  const [columns, setColumns] = createSignal(PANEL_DEFAULTS.columns);
  const [header, setHeader] = createSignal(PANEL_DEFAULTS.header);
  const rowsId = createUniqueId();
  const columnsId = createUniqueId();
  const headerId = createUniqueId();
  let root: HTMLDivElement | undefined;
  let firstField: HTMLInputElement | undefined;

  createEffect(
    () => props.open,
    (open) => {
      if (!open) return;
      setRows(PANEL_DEFAULTS.rows);
      setColumns(PANEL_DEFAULTS.columns);
      setHeader(PANEL_DEFAULTS.header);
      onSettled(() => {
        firstField?.focus();
        firstField?.select();
      });
    },
  );

  onSettled(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (props.open && root && !root.contains(event.target as Node)) props.onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  });

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    props.onClose();
  };

  const onFocusOut = (event: FocusEvent) => {
    const next = event.relatedTarget;
    if (next instanceof Node && root && !root.contains(next)) props.onClose();
  };

  const commit = (
    event: FocusEvent & { currentTarget: HTMLInputElement },
    max: number,
    set: (value: number) => void,
  ) => {
    const value = clamp(event.currentTarget.valueAsNumber, max);
    set(value);
    event.currentTarget.value = String(value);
  };

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    props.onInsert({
      rows: clamp(rows(), MAX_TABLE_ROWS),
      columns: clamp(columns(), MAX_TABLE_COLUMNS),
      header: header(),
    });
  };

  const fieldClass =
    "h-7 w-16 rounded-md bg-surface-raised px-2 text-[13px] text-text outline-none focus-visible:ring-2 focus-visible:ring-accent";

  return (
    <Show when={props.open}>
      <div
        ref={(el) => (root = el)}
        role="dialog"
        aria-label="Insert table"
        class="popover absolute top-full right-0 z-40 mt-1.5 w-60 p-3 text-[13px] text-text"
        onKeyDown={onKeyDown}
        onFocusOut={onFocusOut}
      >
        <form class="flex flex-col gap-2.5" novalidate onSubmit={submit}>
          <div class="flex items-center justify-between gap-2">
            <label for={rowsId} class="text-text-muted">
              Rows
            </label>
            <input
              ref={(el) => (firstField = el)}
              id={rowsId}
              type="number"
              min={1}
              max={MAX_TABLE_ROWS}
              class={fieldClass}
              value={rows()}
              onInput={(event) => setRows(event.currentTarget.valueAsNumber)}
              onBlur={(event) => commit(event, MAX_TABLE_ROWS, setRows)}
            />
          </div>
          <div class="flex items-center justify-between gap-2">
            <label for={columnsId} class="text-text-muted">
              Columns
            </label>
            <input
              id={columnsId}
              type="number"
              min={1}
              max={MAX_TABLE_COLUMNS}
              class={fieldClass}
              value={columns()}
              onInput={(event) => setColumns(event.currentTarget.valueAsNumber)}
              onBlur={(event) => commit(event, MAX_TABLE_COLUMNS, setColumns)}
            />
          </div>
          <label for={headerId} class="flex items-center gap-2 text-text-muted">
            <input
              id={headerId}
              type="checkbox"
              class="size-3.5 accent-accent"
              checked={header()}
              onChange={(event) => setHeader(event.currentTarget.checked)}
            />
            Include header row
          </label>
          <button
            type="submit"
            class="mt-0.5 h-7 rounded-md bg-accent px-2 text-[12px] font-bold text-accent-fg transition-opacity duration-100 hover:opacity-90"
          >
            Insert table
          </button>
        </form>
      </div>
    </Show>
  );
}
