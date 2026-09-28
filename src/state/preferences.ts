import type { Accessor } from "solid-js";
import { storageKey } from "~/lib/storage/key-value";
import { createPersistedSignal } from "~/lib/storage/persisted";

export type PreferenceControl =
  | { kind: "choice"; options: readonly string[]; labels: Readonly<Record<string, string>> }
  | { kind: "toggle" }
  | { kind: "themes" };

export interface PreferenceDefinition<T> {
  name: string;
  label: string;
  fallback: T;
  parse: (value: unknown) => value is T;
  control: PreferenceControl;
}

export interface Preference<T> extends PreferenceDefinition<T> {
  key: string;
  value: Accessor<T>;
  peek(): T;
  set(next: T): void;
  reset(): void;
}

const registry = new Map<string, Preference<unknown>>();

export function preferenceKey(name: string): string {
  return storageKey("pref", name);
}

export function definePreference<T>(definition: PreferenceDefinition<T>): Preference<T> {
  const persisted = createPersistedSignal({
    key: preferenceKey(definition.name),
    fallback: definition.fallback,
    parse: definition.parse,
  });
  const preference: Preference<T> = {
    ...definition,
    key: persisted.key,
    value: persisted.value,
    peek: () => persisted.peek(),
    set: (next) => persisted.set(next),
    reset: () => persisted.reset(),
  };
  registry.set(definition.name, preference as Preference<unknown>);
  return preference;
}

export function preferences(): readonly Preference<unknown>[] {
  return Array.from(registry.values());
}

export function findPreference(name: string): Preference<unknown> | undefined {
  return registry.get(name);
}

export function resetPreferences(): void {
  for (const preference of registry.values()) preference.reset();
}
