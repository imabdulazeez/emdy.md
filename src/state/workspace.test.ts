import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { flush } from "solid-js";
import { isSplitRatio } from "~/lib/split-ratio";
import { decodeStored } from "~/lib/storage/persisted";
import {
  POSITION_WRITE_DELAY_MS,
  documentPosition,
  documentPositions,
  forgetPosition,
  isDocumentPosition,
  isFlag,
  isPinned,
  isPinnedList,
  isSplitLayout,
  lastDocumentId,
  otherFoldersCollapsed,
  pinDocument,
  pinnedDocumentIds,
  rememberDocument,
  resetWorkspaceState,
  retainPins,
  retainPositions,
  savePosition,
  setOtherFoldersCollapsed,
  peekSplitLayout,
  sameSplitLayout,
  setSplitLayout,
  setSplitRatio,
  splitLayout,
  splitRatio,
  SPLIT_RATIO_WRITE_DELAY_MS,
  unpinDocument,
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

  it("starts with nothing pinned", () => {
    expect(pinnedDocumentIds()).toEqual([]);
    expect(isPinned("abc123")).toBe(false);
  });

  it("validates pinned lists", () => {
    expect(isPinnedList([])).toBe(true);
    expect(isPinnedList(["abc123", "def456"])).toBe(true);
    expect(isPinnedList(["abc123", "abc123"])).toBe(false);
    expect(isPinnedList(["not-an-id!"])).toBe(false);
    expect(isPinnedList([1])).toBe(false);
    expect(isPinnedList({ abc123: true })).toBe(false);
    expect(isPinnedList(null)).toBe(false);
  });

  it("pins documents in the order they were pinned and writes them at once", () => {
    flush(() => pinDocument("def456"));
    flush(() => pinDocument("abc123"));
    expect(pinnedDocumentIds()).toEqual(["def456", "abc123"]);
    expect(isPinned("abc123")).toBe(true);
    expect(JSON.parse(window.localStorage.getItem("emdy:workspace:pinned")!)).toEqual([
      "def456",
      "abc123",
    ]);
  });

  it("ignores repeated pins, invalid ids, and unpinning what is not pinned", () => {
    flush(() => pinDocument("abc123"));
    const before = pinnedDocumentIds();
    flush(() => pinDocument("abc123"));
    flush(() => pinDocument("not-an-id!"));
    flush(() => unpinDocument("def456"));
    expect(pinnedDocumentIds()).toBe(before);
  });

  it("unpins and prunes pinned documents", () => {
    flush(() => {
      pinDocument("abc123");
      pinDocument("def456");
      pinDocument("ghi789");
    });
    flush(() => unpinDocument("abc123"));
    expect(pinnedDocumentIds()).toEqual(["def456", "ghi789"]);
    flush(() => retainPins(["ghi789"]));
    expect(pinnedDocumentIds()).toEqual(["ghi789"]);
    const before = pinnedDocumentIds();
    flush(() => retainPins(["ghi789", "zzz999"]));
    expect(pinnedDocumentIds()).toBe(before);
  });

  it("falls back to nothing pinned when the stored list is invalid", () => {
    expect(decodeStored('["abc123","abc123"]', isPinnedList, [])).toEqual([]);
    expect(decodeStored("not json", isPinnedList, [])).toEqual([]);
    expect(decodeStored('["abc123"]', isPinnedList, [])).toEqual(["abc123"]);
  });

  it("keeps other folders expanded until the user collapses them, and writes at once", () => {
    expect(otherFoldersCollapsed()).toBe(false);
    flush(() => setOtherFoldersCollapsed(true));
    expect(otherFoldersCollapsed()).toBe(true);
    expect(window.localStorage.getItem("emdy:workspace:other-folders-collapsed")).toBe("true");
    flush(() => setOtherFoldersCollapsed(false));
    expect(window.localStorage.getItem("emdy:workspace:other-folders-collapsed")).toBe("false");
  });

  it("falls back to expanded other folders when the stored value is invalid", () => {
    expect(decodeStored('"yes"', isFlag, false)).toBe(false);
    expect(decodeStored("not json", isFlag, false)).toBe(false);
    expect(decodeStored("true", isFlag, false)).toBe(true);
  });

  it("resets to defaults and clears storage", () => {
    flush(() => {
      rememberDocument("abc123");
      savePosition("abc123", { line: 4 });
      pinDocument("abc123");
      setOtherFoldersCollapsed(true);
    });
    flush(() => resetWorkspaceState());
    expect(lastDocumentId()).toBeNull();
    expect(documentPositions()).toEqual({});
    expect(pinnedDocumentIds()).toEqual([]);
    expect(window.localStorage.getItem("emdy:workspace:pinned")).toBeNull();
    expect(window.localStorage.getItem("emdy:workspace:last-document")).toBeNull();
    expect(otherFoldersCollapsed()).toBe(false);
    expect(window.localStorage.getItem("emdy:workspace:other-folders-collapsed")).toBeNull();
  });

  it("starts without a split and validates stored layouts", () => {
    expect(splitLayout()).toBeNull();
    expect(isSplitLayout(null)).toBe(true);
    expect(isSplitLayout({ other: "abc123", side: "left" })).toBe(true);
    expect(isSplitLayout({ other: "abc123", side: "right" })).toBe(true);
    expect(isSplitLayout({ other: "abc123", side: "top" })).toBe(false);
    expect(isSplitLayout({ other: "Not an id", side: "left" })).toBe(false);
    expect(isSplitLayout({ other: "abc123" })).toBe(false);
    expect(isSplitLayout({ other: "abc123", side: "left", extra: 1 })).toBe(false);
    expect(isSplitLayout(["abc123", "left"])).toBe(false);
    expect(isSplitLayout("abc123")).toBe(false);
  });

  it("compares layouts by value", () => {
    expect(sameSplitLayout(null, null)).toBe(true);
    expect(sameSplitLayout({ other: "abc123", side: "left" }, null)).toBe(false);
    expect(
      sameSplitLayout({ other: "abc123", side: "left" }, { other: "abc123", side: "left" }),
    ).toBe(true);
    expect(
      sameSplitLayout({ other: "abc123", side: "left" }, { other: "abc123", side: "right" }),
    ).toBe(false);
  });

  it("writes the split layout and clears it", () => {
    flush(() => setSplitLayout({ other: "abc123", side: "right" }));
    expect(splitLayout()).toEqual({ other: "abc123", side: "right" });
    expect(peekSplitLayout()).toEqual({ other: "abc123", side: "right" });
    expect(JSON.parse(window.localStorage.getItem("emdy:workspace:split")!)).toEqual({
      other: "abc123",
      side: "right",
    });
    flush(() => setSplitLayout({ other: "Not an id", side: "left" }));
    expect(splitLayout()).toEqual({ other: "abc123", side: "right" });
    flush(() => setSplitLayout(null));
    expect(splitLayout()).toBeNull();
    expect(window.localStorage.getItem("emdy:workspace:split")).toBe("null");
  });

  it("falls back to no split when the stored layout is malformed", () => {
    expect(decodeStored('{"other":"abc123","side":"middle"}', isSplitLayout, null)).toBeNull();
    expect(decodeStored("not json", isSplitLayout, null)).toBeNull();
    expect(decodeStored('{"other":"abc123","side":"left"}', isSplitLayout, null)).toEqual({
      other: "abc123",
      side: "left",
    });
  });

  it("starts the split at an even share and writes a new one after a delay", () => {
    vi.useFakeTimers();
    expect(splitRatio()).toBe(0.5);
    flush(() => setSplitRatio(0.35));
    expect(splitRatio()).toBe(0.35);
    expect(window.localStorage.getItem("emdy:workspace:split-ratio")).toBeNull();
    vi.advanceTimersByTime(SPLIT_RATIO_WRITE_DELAY_MS);
    expect(window.localStorage.getItem("emdy:workspace:split-ratio")).toBe("0.35");
  });

  it("refuses split shares outside the bounds", () => {
    flush(() => setSplitRatio(0.95));
    flush(() => setSplitRatio(Number.NaN));
    expect(splitRatio()).toBe(0.5);
    expect(decodeStored("0.9", isSplitRatio, 0.5)).toBe(0.5);
    expect(decodeStored('"0.4"', isSplitRatio, 0.5)).toBe(0.5);
    expect(decodeStored("0.4", isSplitRatio, 0.5)).toBe(0.4);
  });
});
