import { createSignal, type Accessor } from "solid-js";
import { debounce, type Debounced } from "~/lib/debounce";
import { storage } from "./key-value";

export interface PersistedOptions<T> {
  key: string;
  fallback: T;
  parse: (value: unknown) => value is T;
  writeDelayMs?: number;
}

export interface Persisted<T> {
  key: string;
  value: Accessor<T>;
  peek(): T;
  set(next: T | ((previous: T) => T)): void;
  reset(): void;
}

interface Entry {
  receive(raw: string | null): void;
  flush(): void;
}

const entries = new Map<string, Entry>();

export function decodeStored<T>(
  raw: string | null,
  parse: (value: unknown) => value is T,
  fallback: T,
): T {
  if (raw === null) return fallback;
  try {
    const value: unknown = JSON.parse(raw);
    return parse(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

export type PersistenceWindow = Pick<Window, "addEventListener" | "removeEventListener">;

export function createPersistedSignal<T>(options: PersistedOptions<T>): Persisted<T> {
  const { key, fallback, parse } = options;
  let current = decodeStored(storage().get(key), parse, fallback);
  const [value, setValue] = createSignal<T>(current as Exclude<T, Function>);
  const write = (next: T) => storage().set(key, JSON.stringify(next));
  const scheduled: Debounced<[T]> | null = options.writeDelayMs
    ? debounce(write, options.writeDelayMs)
    : null;

  const set = (next: T | ((previous: T) => T)) => {
    current = typeof next === "function" ? (next as (previous: T) => T)(current) : next;
    const resolved = current;
    setValue(() => resolved);
    if (scheduled) scheduled(resolved);
    else write(resolved);
  };

  const reset = () => {
    scheduled?.cancel();
    current = fallback;
    setValue(() => fallback);
    storage().remove(key);
  };

  entries.set(key, {
    receive(raw) {
      scheduled?.cancel();
      current = decodeStored(raw, parse, fallback);
      const received = current;
      setValue(() => received);
    },
    flush() {
      scheduled?.flush();
    },
  });

  return { key, value, peek: () => current, set, reset };
}

export function flushPersistence(): void {
  for (const entry of entries.values()) entry.flush();
}

export function startPersistenceSync(win: PersistenceWindow = window): () => void {
  const unsubscribe = storage().subscribe((key, raw) => {
    if (key === null) {
      for (const entry of entries.values()) entry.receive(null);
      return;
    }
    entries.get(key)?.receive(raw);
  });
  win.addEventListener("pagehide", flushPersistence);
  return () => {
    unsubscribe();
    win.removeEventListener("pagehide", flushPersistence);
  };
}
