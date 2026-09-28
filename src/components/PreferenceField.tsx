import { createUniqueId, For, Match, Switch } from "solid-js";
import type { Preference } from "~/state/preferences";
import ThemeLibrary from "./ThemeLibrary";

export interface PreferenceFieldProps {
  preference: Preference<unknown>;
}

export default function PreferenceField(props: PreferenceFieldProps) {
  if (props.preference.control.kind === "themes") {
    return <ThemeLibrary label={props.preference.label} />;
  }
  return <InlinePreferenceField preference={props.preference} />;
}

function InlinePreferenceField(props: PreferenceFieldProps) {
  const labelId = createUniqueId();
  const control = () => props.preference.control;

  return (
    <div
      class="flex min-h-11 items-center justify-between gap-4 py-2"
      data-preference={props.preference.name}
    >
      <span id={labelId} class="text-text">
        {props.preference.label}
      </span>
      <Switch>
        <Match when={control().kind === "choice" && control()}>
          {(choice) => {
            const options = () => (choice() as { options: readonly string[] }).options;
            const labels = () => (choice() as { labels: Readonly<Record<string, string>> }).labels;
            return (
              <div role="radiogroup" aria-labelledby={labelId} class="segment-track">
                <For each={options()}>
                  {(option) => (
                    <button
                      type="button"
                      role="radio"
                      class="segment px-2.5 text-[12px]"
                      aria-checked={props.preference.value() === option ? "true" : "false"}
                      onClick={() => props.preference.set(option)}
                    >
                      {labels()[option] ?? option}
                    </button>
                  )}
                </For>
              </div>
            );
          }}
        </Match>
        <Match when={control().kind === "toggle"}>
          <button
            type="button"
            role="switch"
            aria-labelledby={labelId}
            aria-checked={props.preference.value() ? "true" : "false"}
            class="group relative h-5 w-9 shrink-0 rounded-full bg-hover-strong transition-colors duration-150 aria-checked:bg-accent"
            onClick={() => props.preference.set(!props.preference.value())}
          >
            <span
              aria-hidden="true"
              class="absolute top-0.5 left-0.5 size-4 rounded-full bg-surface shadow-lift transition-transform duration-150 group-aria-checked:translate-x-4"
            />
          </button>
        </Match>
      </Switch>
    </div>
  );
}
