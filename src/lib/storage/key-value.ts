export type StorageListener = (key: string | null, value: string | null) => void;

export interface KeyValueStore {
  keys(): string[];
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  subscribe(listener: StorageListener): () => void;
}

export type StorageArea = "pref" | "workspace";

export const STORAGE_PREFIX = "emdy:";

export function storageKey(area: StorageArea, name: string): string {
  return `${STORAGE_PREFIX}${area}:${name}`;
}

export function createMemoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    keys: () => Array.from(data.keys()),
    get: (key) => data.get(key) ?? null,
    set(key, value) {
      data.set(key, value);
    },
    remove(key) {
      data.delete(key);
    },
    subscribe: () => () => {},
  };
}

export type StorageWindow = Pick<
  Window,
  "localStorage" | "addEventListener" | "removeEventListener"
>;

function attempt<T>(read: () => T, fallback: T): T {
  try {
    return read();
  } catch {
    return fallback;
  }
}

export function createLocalStorageStore(win: StorageWindow): KeyValueStore {
  return {
    keys: () =>
      attempt(
        () =>
          Array.from({ length: win.localStorage.length }, (_, index) =>
            win.localStorage.key(index),
          ).filter((key): key is string => key !== null),
        [],
      ),
    get: (key) => attempt(() => win.localStorage.getItem(key), null),
    set(key, value) {
      attempt(() => win.localStorage.setItem(key, value), undefined);
    },
    remove(key) {
      attempt(() => win.localStorage.removeItem(key), undefined);
    },
    subscribe(listener) {
      const onStorage = (event: StorageEvent) => {
        if (event.key === null || event.key.startsWith(STORAGE_PREFIX)) {
          listener(event.key, event.newValue);
        }
      };
      win.addEventListener("storage", onStorage);
      return () => win.removeEventListener("storage", onStorage);
    },
  };
}

function hasLocalStorage(): boolean {
  return attempt(() => typeof window !== "undefined" && window.localStorage !== undefined, false);
}

let store: KeyValueStore = hasLocalStorage()
  ? createLocalStorageStore(window)
  : createMemoryStore();

export function storage(): KeyValueStore {
  return store;
}

export function useStorage(next: KeyValueStore): () => void {
  const previous = store;
  store = next;
  return () => {
    store = previous;
  };
}
