import { definePreference } from "./preferences";

export function isRulersPreference(value: unknown): value is boolean {
  return typeof value === "boolean";
}

export const rulers = definePreference<boolean>({
  name: "rulers",
  label: "Line and column rulers",
  fallback: false,
  parse: isRulersPreference,
  control: { kind: "toggle" },
});

const showRulers = rulers.value;

export { showRulers };

export function setShowRulers(visible: boolean): void {
  rulers.set(visible);
}

export function toggleRulers(): void {
  rulers.set(!rulers.peek());
}

export function resetRulersState(): void {
  rulers.reset();
}
