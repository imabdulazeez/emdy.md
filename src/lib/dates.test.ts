import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import {
  addMonths,
  dateSuggestions,
  formatDate,
  formatDateTime,
  formatIsoWeek,
  lastWeekday,
  nextWeekday,
  parseIsoDate,
} from "./dates";

// Monday 28 September 2026, 14:05 local time.
const NOW = new Date(2026, 8, 28, 14, 5);

function values(query: string, now = NOW) {
  return dateSuggestions(query, now).map((suggestion) => [suggestion.label, suggestion.value]);
}

describe("formatDate", () => {
  it("pads the local calendar date", () => {
    expect(formatDate(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(formatDateTime(new Date(2026, 0, 5, 7, 3))).toBe("2026-01-05 07:03");
  });

  describe("in a time zone far from UTC", () => {
    const original = process.env.TZ;
    beforeAll(() => {
      process.env.TZ = "Pacific/Kiritimati";
    });
    afterAll(() => {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    });

    it("uses the local date late in the evening, not the UTC one", () => {
      const lateEvening = new Date(2026, 8, 28, 23, 30);
      expect(lateEvening.toISOString().slice(0, 10)).toBe("2026-09-28");
      expect(formatDate(lateEvening)).toBe("2026-09-28");
      const earlyMorning = new Date(2026, 8, 29, 0, 30);
      expect(earlyMorning.toISOString().slice(0, 10)).toBe("2026-09-28");
      expect(formatDate(earlyMorning)).toBe("2026-09-29");
      expect(dateSuggestions("today", earlyMorning)[0].value).toBe("2026-09-29");
    });
  });
});

describe("formatIsoWeek", () => {
  it("numbers weeks from the week holding the first Thursday", () => {
    expect(formatIsoWeek(NOW)).toBe("2026-W40");
    expect(formatIsoWeek(new Date(2026, 0, 1))).toBe("2026-W01");
    expect(formatIsoWeek(new Date(2027, 0, 1))).toBe("2026-W53");
    expect(formatIsoWeek(new Date(2024, 11, 30))).toBe("2025-W01");
  });
});

describe("date arithmetic", () => {
  it("clamps month shifts to the end of shorter months", () => {
    expect(formatDate(addMonths(new Date(2026, 0, 31), 1))).toBe("2026-02-28");
    expect(formatDate(addMonths(new Date(2024, 0, 31), 1))).toBe("2024-02-29");
    expect(formatDate(addMonths(new Date(2026, 2, 31), -1))).toBe("2026-02-28");
  });

  it("finds weekdays strictly after and before a date", () => {
    expect(formatDate(nextWeekday(NOW, 1))).toBe("2026-10-05");
    expect(formatDate(nextWeekday(NOW, 5))).toBe("2026-10-02");
    expect(formatDate(lastWeekday(NOW, 1))).toBe("2026-09-21");
    expect(formatDate(lastWeekday(NOW, 5))).toBe("2026-09-25");
  });

  it("accepts only real calendar dates", () => {
    expect(parseIsoDate("2024-02-29")).not.toBeNull();
    expect(parseIsoDate("2026-02-29")).toBeNull();
    expect(parseIsoDate("2026-13-01")).toBeNull();
    expect(parseIsoDate("2026-1-01")).toBeNull();
  });
});

describe("dateSuggestions", () => {
  it("offers the everyday dates for an empty query", () => {
    expect(values("")).toEqual([
      ["Today", "2026-09-28"],
      ["Tomorrow", "2026-09-29"],
      ["Yesterday", "2026-09-27"],
      ["Now", "2026-09-28 14:05"],
    ]);
  });

  it("completes keywords by prefix, ignoring case", () => {
    expect(values("tod")).toEqual([["Today", "2026-09-28"]]);
    expect(values("T")).toEqual([
      ["Today", "2026-09-28"],
      ["Tomorrow", "2026-09-29"],
      ["Tuesday", "2026-09-29"],
      ["Thursday", "2026-10-01"],
    ]);
    expect(values("week")).toEqual([["This week", "2026-W40"]]);
    expect(values("now")).toEqual([["Now", "2026-09-28 14:05"]]);
  });

  it("resolves weekday names to the next one, and last or next explicitly", () => {
    expect(values("fri")).toEqual([["Friday", "2026-10-02"]]);
    expect(values("monday")).toEqual([["Monday", "2026-10-05"]]);
    expect(values("next fri")).toEqual([["Next Friday", "2026-10-02"]]);
    expect(values("last   fri")).toEqual([["Last Friday", "2026-09-25"]]);
    expect(values("last")).toHaveLength(7);
  });

  it("reads forward and backward offsets in words", () => {
    expect(values("in 3 days")).toEqual([["In 3 days", "2026-10-01"]]);
    expect(values("in 1 w")).toEqual([["In 1 week", "2026-10-05"]]);
    expect(values("in 2")).toEqual([
      ["In 2 days", "2026-09-30"],
      ["In 2 weeks", "2026-10-12"],
      ["In 2 months", "2026-11-28"],
      ["In 2 years", "2028-09-28"],
    ]);
    expect(values("2 weeks ago")).toEqual([["2 weeks ago", "2026-09-14"]]);
    expect(values("1 mo")).toEqual([["1 month ago", "2026-08-28"]]);
    expect(values("5 ")).toHaveLength(4);
    expect(values("5")).toEqual([]);
    expect(values("in 3 fortnights")).toEqual([]);
  });

  it("reads signed shorthand offsets, defaulting to days", () => {
    expect(values("-2w")).toEqual([["2 weeks ago", "2026-09-14"]]);
    expect(values("+3d")).toEqual([["In 3 days", "2026-10-01"]]);
    expect(values("+3")).toEqual([["In 3 days", "2026-10-01"]]);
    expect(values("-1y")).toEqual([["1 year ago", "2025-09-28"]]);
    expect(values("+1m", new Date(2026, 0, 31))).toEqual([["In 1 month", "2026-02-28"]]);
  });

  it("validates a typed date", () => {
    expect(values("2026-10-01")).toEqual([["Date", "2026-10-01"]]);
    expect(values("2026-02-30")).toEqual([]);
  });

  it("returns nothing for text that is not a date", () => {
    expect(values("meeting notes")).toEqual([]);
  });
});
