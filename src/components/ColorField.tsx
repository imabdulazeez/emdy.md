export interface ColorFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => boolean;
}

export default function ColorField(props: ColorFieldProps) {
  const commit = (input: HTMLInputElement) => {
    props.onChange(input.value);
    input.value = props.value;
  };

  return (
    <div class="flex min-h-9 items-center gap-3" data-color-field={props.label}>
      <label
        class="relative size-6 shrink-0 cursor-pointer rounded-full shadow-lift has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-accent"
        style={{ background: props.value }}
      >
        <input
          type="color"
          class="absolute inset-0 size-full cursor-pointer opacity-0"
          aria-label={`${props.label} colour`}
          value={props.value}
          onInput={(event) => props.onChange(event.currentTarget.value)}
        />
      </label>
      <span class="min-w-0 flex-1 truncate text-text">{props.label}</span>
      <input
        type="text"
        spellcheck={false}
        autocomplete="off"
        class="h-7 w-22 rounded-md bg-surface-raised px-2 font-mono text-[12px] text-text-muted uppercase focus:text-text focus-visible:outline-2 focus-visible:outline-accent"
        aria-label={`${props.label} hex value`}
        value={props.value}
        onChange={(event) => commit(event.currentTarget)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit(event.currentTarget);
          }
        }}
      />
    </div>
  );
}
