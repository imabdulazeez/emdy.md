import { describe, expect, it } from "vite-plus/test";
import {
  formatEdited,
  formatEditedStamp,
  groupByRecency,
  recencyGroup,
  RECENCY_LABELS,
  sameSections,
} from "./recency";

const at = (year: number, month: number, day: number, hour = 12, minute = 0) =>
  new Date(year, month - 1, day, hour, minute).getTime();

const now = at(2026, 3, 18, 9, 30);

describe("recencyGroup", () => {
  it("counts whole calendar days rather than elapsed hours", () => {
    expect(recencyGroup(at(2026, 3, 18, 0, 1), now)).toBe("today");
    expect(recencyGroup(at(2026, 3, 18, 23, 59), now)).toBe("today");
    expect(recencyGroup(at(2026, 3, 17, 23, 59), now)).toBe("yesterday");
    expect(recencyGroup(at(2026, 3, 17, 0, 0), now)).toBe("yesterday");
  });

  it("keeps two to seven days back in the last seven days", () => {
    expect(recencyGroup(at(2026, 3, 16), now)).toBe("week");
    expect(recencyGroup(at(2026, 3, 11, 0, 1), now)).toBe("week");
  });

  it("keeps eight to thirty days back in the last thirty days", () => {
    expect(recencyGroup(at(2026, 3, 10, 23, 59), now)).toBe("month");
    expect(recencyGroup(at(2026, 2, 16, 0, 1), now)).toBe("month");
  });

  it("treats anything from thirty-one days back as older", () => {
    expect(recencyGroup(at(2026, 2, 15, 23, 59), now)).toBe("older");
    expect(recencyGroup(at(2025, 12, 31), now)).toBe("older");
    expect(recencyGroup(0, now)).toBe("older");
  });

  it("reads a timestamp from the future as today", () => {
    expect(recencyGroup(at(2026, 3, 19), now)).toBe("today");
    expect(recencyGroup(at(2030, 1, 1), now)).toBe("today");
  });

  it("survives a daylight-saving change", () => {
    const spring = at(2026, 3, 29, 12);
    expect(recencyGroup(at(2026, 3, 28, 12), spring)).toBe("yesterday");
    expect(recencyGroup(at(2026, 3, 29, 3), spring)).toBe("today");
  });
});

describe("groupByRecency", () => {
  const stamped = (name: string, modified: number) => ({ name, modified });

  it("returns non-empty sections newest first and orders each newest first", () => {
    const items = [
      stamped("old", at(2026, 1, 1)),
      stamped("today-first", at(2026, 3, 18, 1)),
      stamped("week", at(2026, 3, 14)),
      stamped("month", at(2026, 3, 1)),
      stamped("today-second", at(2026, 3, 18, 8)),
      stamped("older-again", at(2025, 6, 6)),
    ];
    expect(
      groupByRecency(items, (item) => item.modified, now).map((section) => [
        section.group,
        section.label,
        section.items.map((item) => item.name),
      ]),
    ).toEqual([
      ["today", "Today", ["today-second", "today-first"]],
      ["week", "Last 7 days", ["week"]],
      ["month", "Last 30 days", ["month"]],
      ["older", "Older", ["old", "older-again"]],
    ]);
  });

  it("keeps input order for equally recent items", () => {
    const items = [stamped("first", now), stamped("second", now)];
    expect(
      groupByRecency(items, (item) => item.modified, now)[0].items.map((item) => item.name),
    ).toEqual(["first", "second"]);
  });

  it("returns nothing for an empty list", () => {
    expect(groupByRecency([], () => now, now)).toEqual([]);
  });

  it("labels every group", () => {
    expect(Object.values(RECENCY_LABELS)).toEqual([
      "Today",
      "Yesterday",
      "Last 7 days",
      "Last 30 days",
      "Older",
    ]);
  });
});

describe("sameSections", () => {
  const same = (a: string, b: string) => a === b;
  const today = { group: "today" as const, label: "Today", items: ["a", "b"] };
  const older = { group: "older" as const, label: "Older", items: ["c"] };

  it("treats sections with the same groups and items as equal", () => {
    expect(sameSections([today, older], [{ ...today, items: ["a", "b"] }, older], same)).toBe(true);
    expect(sameSections([], [], same)).toBe(true);
  });

  it("notices a changed, added, removed, or reordered item", () => {
    expect(sameSections([today], [{ ...today, items: ["a", "x"] }], same)).toBe(false);
    expect(sameSections([today], [{ ...today, items: ["a", "b", "c"] }], same)).toBe(false);
    expect(sameSections([today], [{ ...today, items: ["a"] }], same)).toBe(false);
    expect(sameSections([today], [{ ...today, items: ["b", "a"] }], same)).toBe(false);
  });

  it("notices an item moving between groups or a group disappearing", () => {
    expect(sameSections([today, older], [{ ...today, items: ["a", "b", "c"] }], same)).toBe(false);
    expect(
      sameSections([today], [{ group: "yesterday", label: "Yesterday", items: ["a", "b"] }], same),
    ).toBe(false);
  });
});

describe("formatEdited", () => {
  it("reads as just now under a minute", () => {
    expect(formatEdited(now, now)).toBe("Edited just now");
    expect(formatEdited(now - 59_000, now)).toBe("Edited just now");
  });

  it("counts whole minutes under an hour", () => {
    expect(formatEdited(now - 60_000, now)).toBe("Edited 1m ago");
    expect(formatEdited(now - 59 * 60_000, now)).toBe("Edited 59m ago");
  });

  it("counts whole hours earlier the same day", () => {
    expect(formatEdited(at(2026, 3, 18, 8, 0), now)).toBe("Edited 1h ago");
    expect(formatEdited(at(2026, 3, 18, 0, 1), now)).toBe("Edited 9h ago");
  });

  it("switches to yesterday at the calendar day rather than after 24 hours", () => {
    expect(formatEdited(at(2026, 3, 17, 23, 59), now)).toBe("Edited yesterday");
    expect(formatEdited(at(2026, 3, 17, 0, 0), now)).toBe("Edited yesterday");
  });

  it("names the day for older edits and adds the year only when it differs", () => {
    expect(formatEdited(at(2026, 3, 16), now)).toBe("Edited Mar 16");
    expect(formatEdited(at(2026, 1, 2), now)).toBe("Edited Jan 2");
    expect(formatEdited(at(2025, 12, 31), now)).toBe("Edited Dec 31, 2025");
  });
});

describe("formatEditedStamp", () => {
  it("gives the full local date and time", () => {
    expect(formatEditedStamp(at(2026, 3, 18, 15, 4))).toBe("Last edited Mar 18, 2026, 3:04 PM");
  });
});
