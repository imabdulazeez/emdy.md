import { entryFor } from "./catalog";
import { hashText } from "./hash";
import { afterEach, describe, expect, it } from "vite-plus/test";
import {
  JOURNAL_PREFIX,
  acknowledgeJournal,
  readJournals,
  replayJournal,
  JOURNAL_KEY,
  clearJournal,
  isJournalEntry,
  readJournal,
  writeJournal,
} from "./journal";

afterEach(() => {
  for (const snapshot of readJournals()) clearJournal(snapshot.key);
  clearJournal();
});

describe("pending-write journal", () => {
  it("round-trips entries through the key-value store", () => {
    expect(readJournal()).toEqual([]);
    writeJournal([{ id: "abc123", title: "A", text: "body", bases: ["ff"] }]);
    expect(window.localStorage.getItem(JOURNAL_KEY)).toContain("abc123");
    expect(readJournal()).toEqual([{ id: "abc123", title: "A", text: "body", bases: ["ff"] }]);
    clearJournal();
    expect(readJournal()).toEqual([]);
    expect(window.localStorage.getItem(JOURNAL_KEY)).toBeNull();
  });

  it("removes the key when given no entries", () => {
    writeJournal([{ id: "abc123", title: "A", text: "body", bases: [] }]);
    writeJournal([]);
    expect(window.localStorage.getItem(JOURNAL_KEY)).toBeNull();
  });

  it("ignores malformed or invalid stored values", () => {
    window.localStorage.setItem(JOURNAL_KEY, "{not json");
    expect(readJournal()).toEqual([]);
    window.localStorage.setItem(JOURNAL_KEY, JSON.stringify([{ id: "bad id", title: "x" }]));
    expect(readJournal()).toEqual([]);
    window.localStorage.setItem(JOURNAL_KEY, JSON.stringify({ id: "abc123" }));
    expect(readJournal()).toEqual([]);
    expect(isJournalEntry({ id: "abc123", title: "t", text: "x", bases: [] })).toBe(true);
    expect(isJournalEntry({ id: "abc123", title: "t", text: "x", bases: [4] })).toBe(false);
    expect(isJournalEntry({ id: "abc123", title: "t", text: "x", bases: "ff" })).toBe(false);
    expect(isJournalEntry(null)).toBe(false);
  });

  it("keeps a valid or cleared icon and drops an invalid one without rejecting the entry", () => {
    const icon = { kind: "emoji", emoji: "📚" };
    const base = { id: "abc123", title: "t", text: "x", bases: [] };
    expect(isJournalEntry({ ...base, icon })).toBe(true);
    const cleared = { ...base, icon: null };
    expect(isJournalEntry(cleared)).toBe(true);
    expect(cleared.icon).toBeNull();
    const invalid: Record<string, unknown> = { ...base, icon: { kind: "sticker" } };
    expect(isJournalEntry(invalid)).toBe(true);
    expect(invalid).not.toHaveProperty("icon");
    window.localStorage.setItem(JOURNAL_KEY, JSON.stringify([{ ...base, icon }]));
    expect(readJournal()).toEqual([{ ...base, icon }]);
  });
});

describe("journal ownership and replay", () => {
  it("keeps independent journals and acknowledges only an unchanged snapshot", () => {
    const first = `${JOURNAL_PREFIX}first`;
    const second = `${JOURNAL_PREFIX}second`;
    const doc = { id: "abc123", title: "A", text: "first", bases: [] };
    writeJournal([doc], first);
    writeJournal([{ ...doc, text: "second" }], second);
    const snapshot = readJournals().find((item) => item.key === first)!;
    clearJournal(second);
    expect(readJournal(first)).toEqual([doc]);
    writeJournal([{ ...doc, text: "newer" }], first);
    acknowledgeJournal(snapshot);
    expect(readJournal(first)[0].text).toBe("newer");
    acknowledgeJournal(readJournals().find((item) => item.key === first)!);
    expect(readJournal(first)).toEqual([]);
  });

  it("restores edits and new documents while copying stale edits", () => {
    const loaded = [entryFor("abc123", "A.md", "A", "disk", 4, 1, 1)];
    const edit = { id: "abc123", title: "A", text: "recovered", bases: [hashText("disk")] };
    expect(replayJournal(loaded, [edit]).resave).toEqual([
      { id: "abc123", title: "A", text: "recovered" },
    ]);
    const stale = replayJournal(loaded, [{ ...edit, bases: ["stale"] }]);
    expect(stale.documents[0].text).toBe("disk");
    expect(stale.resave[0]).toMatchObject({ title: "A (conflict)", text: "recovered" });
    expect(stale.resave[0].id).not.toBe("abc123");
    expect(replayJournal(loaded, [{ ...edit, text: "disk" }]).resave).toEqual([]);
    expect(replayJournal([], [edit]).resave).toEqual([
      { id: "abc123", title: "A", text: "recovered" },
    ]);
  });

  it("carries a journaled icon onto restored documents and conflict copies", () => {
    const loaded = [entryFor("abc123", "A.md", "A", "disk", 4, 1, 1)];
    const icon = { kind: "lucide", name: "map", color: "red" } as const;
    const edit = { id: "abc123", title: "A", text: "recovered", bases: [hashText("disk")], icon };
    const replay = replayJournal(loaded, [edit]);
    expect(replay.resave).toEqual([{ id: "abc123", title: "A", text: "recovered", icon }]);
    expect(replay.documents[0]).toEqual({ id: "abc123", title: "A", text: "recovered", icon });
    expect(replayJournal(loaded, [{ ...edit, bases: ["stale"] }]).resave[0]).toMatchObject({
      title: "A (conflict)",
      text: "recovered",
      icon,
    });
    expect(replayJournal([], [edit]).resave).toEqual([
      { id: "abc123", title: "A", text: "recovered", icon },
    ]);
  });

  it("resaves an entry whose only change is its icon", () => {
    const icon = { kind: "emoji", emoji: "📚" } as const;
    const loaded = [entryFor("abc123", "A.md", "A", "disk", 4, 1, 1)];
    const entry = { id: "abc123", title: "A", text: "disk", bases: [hashText("disk")] };
    expect(replayJournal(loaded, [{ ...entry, icon }]).resave).toEqual([
      { id: "abc123", title: "A", text: "disk", icon },
    ]);
    expect(replayJournal(loaded, [{ ...entry, icon: null }]).resave).toEqual([]);
    const withIcon = [{ ...loaded[0], icon }];
    expect(replayJournal(withIcon, [{ ...entry, icon }]).resave).toEqual([]);
    expect(replayJournal(withIcon, [entry]).resave).toEqual([]);
    expect(replayJournal(withIcon, [{ ...entry, icon: null }]).resave).toEqual([
      { id: "abc123", title: "A", text: "disk", icon: null },
    ]);
  });
});

it("includes existing recovery entries at the shared journal key", () => {
  const key = "emdy:workspace:pending";
  const entries = [{ id: "abc123", title: "A", text: "existing recovery", bases: [] }];
  writeJournal(entries, key);
  const snapshot = readJournals().find((item) => item.key === key)!;
  expect(JSON.parse(snapshot.value)).toEqual(entries);
  clearJournal();
  expect(readJournal(key)).toEqual(entries);
  acknowledgeJournal(snapshot);
  expect(readJournal(key)).toEqual([]);
});
