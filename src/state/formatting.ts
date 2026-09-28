import { createSignal } from "solid-js";
import { type ActiveFormats, EMPTY_FORMATS, formatsEqual } from "~/lib/editor/format-state";

const [activeFormats, setActiveFormatsSignal] = createSignal<ActiveFormats>(EMPTY_FORMATS, {
  equals: formatsEqual,
});

export { activeFormats };

export function setActiveFormats(formats: ActiveFormats): void {
  setActiveFormatsSignal(formats);
}

export function resetFormattingState(): void {
  setActiveFormatsSignal(EMPTY_FORMATS);
}
