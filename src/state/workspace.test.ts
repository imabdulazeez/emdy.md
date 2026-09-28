import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { flush } from "solid-js";
import {
  POSITION_WRITE_DELAY_MS,
  documentPosition,
  documentPositions,
  forgetPosition,
  isDocumentPosition,
  lastDocumentId,
  rememberDocument,
  rememberSidebar,
  resetWorkspaceState,
  retainPositions,
  savePosition,
  sidebarPreference,
} from "./workspace";

afterEach(() => {
  resetWorkspaceState();
  vi.useRealTimers();
});

describe("workspace state", () => {
  it("remembers the last opened document", () => {
    expect(lastDocumentId()).toBeNull();
    flush(() => rememberDocument("abc123"));
    expect(lastDocumentId()).toBe("abc123");
    expect(window.localStorage.getItem("emdy:workspace:last-document")).toBe('"abc123"');
  });

  it("remembers the sidebar state only once set", () => {
    expect(sidebarPreference()).toBeNull();
    flush(() => rememberSidebar(false));
    expect(sidebarPreference()).toBe(false);
    expect(window.localStorage.getItem("emdy:workspace:sidebar")).toBe("false");
  });

  it("validates document positions", () => {
    expect(isDocumentPosition({ anchor: 0, head: 4, line: 2 })).toBe(true);
    expect(isDocumentPosition({ anchor: -1, head: 4, line: 2 })).toBe(false);
    expect(isDocumentPosition({ anchor: 0, head: 1.5, line: 2 })).toBe(false);
    expect(isDocumentPosition({ anchor: 0, head: 1 })).toBe(false);
    expect(isDocumentPosition(null)).toBe(false);
  });

  it("merges partial position updates per document and writes them after a delay", () => {
    vi.useFakeTimers();
    flush(() => savePosition("abc123", { anchor: 3, head: 5 }));
    expect(documentPosition("abc123")).toEqual({ anchor: 3, head: 5, line: 0 });
    flush(() => savePosition("abc123", { line: 12 }));
    expect(documentPosition("abc123")).toEqual({ anchor: 3, head: 5, line: 12 });
    expect(window.localStorage.getItem("emdy:workspace:positions")).toBeNull();
    vi.advanceTimersByTime(POSITION_WRITE_DELAY_MS);
    expect(JSON.parse(window.localStorage.getItem("emdy:workspace:positions")!)).toEqual({
      abc123: { anchor: 3, head: 5, line: 12 },
    });
  });

  it("ignores unchanged positions and invalid ids", () => {
    flush(() => savePosition("abc123", { anchor: 1, head: 1, line: 1 }));
    const before = documentPositions();
    flush(() => savePosition("abc123", { anchor: 1 }));
    expect(documentPositions()).toBe(before);
    flush(() => savePosition("not-an-id", { anchor: 1 }));
    expect(documentPosition("not-an-id")).toBeUndefined();
  });

  it("forgets and prunes positions", () => {
    flush(() => savePosition("abc123", { line: 1 }));
    flush(() => savePosition("def456", { line: 2 }));
    flush(() => savePosition("ghi789", { line: 3 }));
    flush(() => forgetPosition("abc123"));
    expect(documentPosition("abc123")).toBeUndefined();
    flush(() => forgetPosition("abc123"));
    flush(() => retainPositions(["def456"]));
    expect(Object.keys(documentPositions())).toEqual(["def456"]);
    const before = documentPositions();
    flush(() => retainPositions(["def456", "zzz999"]));
    expect(documentPositions()).toBe(before);
  });

  it("resets to defaults and clears storage", () => {
    flush(() => {
      rememberDocument("abc123");
      rememberSidebar(true);
      savePosition("abc123", { line: 4 });
    });
    flush(() => resetWorkspaceState());
    expect(lastDocumentId()).toBeNull();
    expect(sidebarPreference()).toBeNull();
    expect(documentPositions()).toEqual({});
    expect(window.localStorage.getItem("emdy:workspace:last-document")).toBeNull();
  });
});
