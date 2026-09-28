import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { flush } from "solid-js";
import {
  createMemoryStore,
  useStorage,
  type KeyValueStore,
  type StorageListener,
} from "./key-value";
import {
  createPersistedSignal,
  decodeStored,
  flushPersistence,
  startPersistenceSync,
} from "./persisted";

const isNumber = (value: unknown): value is number => typeof value === "number";

let restore = () => {};

afterEach(() => {
  restore();
  restore = () => {};
  vi.useRealTimers();
});

function subscribableStore(): KeyValueStore & { emit: StorageListener } {
  const memory = createMemoryStore();
  const listeners = new Set<StorageListener>();
  return {
    ...memory,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(key, value) {
      for (const listener of listeners) listener(key, value);
    },
  };
}

describe("decodeStored", () => {
  it("returns the fallback for missing, malformed, and rejected values", () => {
    expect(decodeStored(null, isNumber, 7)).toBe(7);
    expect(decodeStored("{not json", isNumber, 7)).toBe(7);
    expect(decodeStored('"text"', isNumber, 7)).toBe(7);
    expect(decodeStored("42", isNumber, 7)).toBe(42);
  });
});

describe("createPersistedSignal", () => {
  it("reads the stored value on creation and writes every change", () => {
    const store = createMemoryStore();
    store.set("emdy:pref:n", "3");
    restore = useStorage(store);
    const n = createPersistedSignal({ key: "emdy:pref:n", fallback: 0, parse: isNumber });
    expect(n.value()).toBe(3);
    flush(() => n.set(5));
    expect(n.value()).toBe(5);
    expect(store.get("emdy:pref:n")).toBe("5");
    n.set((previous) => previous + 1);
    n.set((previous) => previous + 1);
    expect(n.peek()).toBe(7);
    expect(n.value()).toBe(5);
    flush();
    expect(n.value()).toBe(7);
    expect(store.get("emdy:pref:n")).toBe("7");
    flush(() => n.reset());
    expect(n.value()).toBe(0);
    expect(store.get("emdy:pref:n")).toBeNull();
  });

  it("falls back when the stored value is invalid", () => {
    const store = createMemoryStore();
    store.set("emdy:pref:bad", '"purple"');
    restore = useStorage(store);
    const bad = createPersistedSignal({ key: "emdy:pref:bad", fallback: 1, parse: isNumber });
    expect(bad.value()).toBe(1);
  });

  it("debounces writes when asked and flushes them on demand", () => {
    vi.useFakeTimers();
    const store = createMemoryStore();
    restore = useStorage(store);
    const slow = createPersistedSignal({
      key: "emdy:workspace:slow",
      fallback: 0,
      parse: isNumber,
      writeDelayMs: 100,
    });
    flush(() => slow.set(1));
    flush(() => slow.set(2));
    expect(slow.value()).toBe(2);
    expect(store.get("emdy:workspace:slow")).toBeNull();
    vi.advanceTimersByTime(100);
    expect(store.get("emdy:workspace:slow")).toBe("2");
    flush(() => slow.set(3));
    flushPersistence();
    expect(store.get("emdy:workspace:slow")).toBe("3");
  });

  it("follows changes made by another tab and stops when disposed", () => {
    const store = subscribableStore();
    restore = useStorage(store);
    const n = createPersistedSignal({ key: "emdy:pref:tab", fallback: 0, parse: isNumber });
    const listeners = new Map<string, () => void>();
    const win = {
      addEventListener: (type: string, cb: () => void) => listeners.set(type, cb),
      removeEventListener: (type: string) => listeners.delete(type),
    } as unknown as Window;
    const stop = startPersistenceSync(win);
    flush(() => store.emit("emdy:pref:tab", "9"));
    expect(n.value()).toBe(9);
    flush(() => store.emit("emdy:pref:tab", '"junk"'));
    expect(n.value()).toBe(0);
    flush(() => n.set(4));
    flush(() => store.emit(null, null));
    expect(n.value()).toBe(0);
    expect(listeners.has("pagehide")).toBe(true);
    stop();
    expect(listeners.has("pagehide")).toBe(false);
    flush(() => store.emit("emdy:pref:tab", "9"));
    expect(n.value()).toBe(0);
  });

  it("flushes pending writes when the page hides", () => {
    vi.useFakeTimers();
    const store = subscribableStore();
    restore = useStorage(store);
    const slow = createPersistedSignal({
      key: "emdy:workspace:hide",
      fallback: 0,
      parse: isNumber,
      writeDelayMs: 100,
    });
    let onHide = () => {};
    const win = {
      addEventListener: (type: string, cb: () => void) => {
        if (type === "pagehide") onHide = cb;
      },
      removeEventListener: () => {},
    } as unknown as Window;
    const stop = startPersistenceSync(win);
    flush(() => slow.set(8));
    onHide();
    expect(store.get("emdy:workspace:hide")).toBe("8");
    stop();
  });
});
