import { describe, expect, it, vi } from "vite-plus/test";
import {
  STORAGE_PREFIX,
  createLocalStorageStore,
  createMemoryStore,
  storage,
  storageKey,
  useStorage,
  type StorageWindow,
} from "./key-value";

describe("storage keys", () => {
  it("namespaces keys by area under the app prefix", () => {
    expect(storageKey("pref", "theme")).toBe(`${STORAGE_PREFIX}pref:theme`);
    expect(storageKey("workspace", "positions")).toBe(`${STORAGE_PREFIX}workspace:positions`);
  });
});

describe("memory store", () => {
  it("stores, reads, and removes values", () => {
    const store = createMemoryStore();
    expect(store.get("a")).toBeNull();
    store.set("a", "1");
    expect(store.get("a")).toBe("1");
    expect(store.keys()).toEqual(["a"]);
    store.remove("a");
    expect(store.get("a")).toBeNull();
    expect(store.subscribe(() => {})).toBeTypeOf("function");
  });
});

describe("localStorage store", () => {
  function fakeWindow(overrides: Partial<Storage> = {}) {
    const data = new Map<string, string>();
    const listeners = new Set<(event: StorageEvent) => void>();
    const localStorage = {
      get length() {
        return data.size;
      },
      key: (index: number) => Array.from(data.keys())[index] ?? null,
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
      removeItem: (key: string) => void data.delete(key),
      ...overrides,
    } as Storage;
    const win = {
      localStorage,
      addEventListener: (_: string, cb: EventListenerOrEventListenerObject) =>
        listeners.add(cb as (event: StorageEvent) => void),
      removeEventListener: (_: string, cb: EventListenerOrEventListenerObject) =>
        listeners.delete(cb as (event: StorageEvent) => void),
    } as unknown as StorageWindow;
    const emit = (key: string | null, newValue: string | null) => {
      for (const cb of listeners) cb({ key, newValue } as StorageEvent);
    };
    return { win, data, listeners, emit };
  }

  it("round-trips values through localStorage", () => {
    const { win, data } = fakeWindow();
    const store = createLocalStorageStore(win);
    store.set("emdy:pref:x", "1");
    expect(data.get("emdy:pref:x")).toBe("1");
    expect(store.get("emdy:pref:x")).toBe("1");
    expect(store.keys()).toEqual(["emdy:pref:x"]);
    store.remove("emdy:pref:x");
    expect(store.get("emdy:pref:x")).toBeNull();
  });

  it("swallows storage failures instead of throwing", () => {
    const boom = () => {
      throw new Error("quota");
    };
    const { win } = fakeWindow({ getItem: boom, setItem: boom, removeItem: boom });
    const store = createLocalStorageStore(win);
    expect(() => store.set("k", "v")).not.toThrow();
    expect(() => store.remove("k")).not.toThrow();
    expect(store.get("k")).toBeNull();
  });

  it("forwards storage events for app keys and clears, then unsubscribes", () => {
    const { win, listeners, emit } = fakeWindow();
    const store = createLocalStorageStore(win);
    const listener = vi.fn();
    const stop = store.subscribe(listener);
    emit("emdy:pref:theme", '"dark"');
    emit("other-app", "x");
    emit(null, null);
    expect(listener.mock.calls).toEqual([
      ["emdy:pref:theme", '"dark"'],
      [null, null],
    ]);
    stop();
    expect(listeners.size).toBe(0);
  });
});

describe("active store", () => {
  it("defaults to the browser store and can be swapped for tests", () => {
    const original = storage();
    original.set("emdy:test:probe", "1");
    expect(window.localStorage.getItem("emdy:test:probe")).toBe("1");
    original.remove("emdy:test:probe");
    const memory = createMemoryStore();
    const restore = useStorage(memory);
    expect(storage()).toBe(memory);
    restore();
    expect(storage()).toBe(original);
  });
});
