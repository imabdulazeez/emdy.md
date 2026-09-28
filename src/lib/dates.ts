export interface DateSuggestion {
  label: string;
  value: string;
}

export const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

type Unit = "day" | "week" | "month" | "year";

const UNITS: readonly Unit[] = ["day", "week", "month", "year"];
const UNIT_ALIASES: Record<string, Unit> = { d: "day", w: "week", m: "month", y: "year" };

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

/** The calendar date in the device's time zone, as `YYYY-MM-DD`. */
export function formatDate(date: Date): string {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatDateTime(date: Date): string {
  return `${formatDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The ISO 8601 week of the local date, as `YYYY-Www`. */
export function formatIsoWeek(date: Date): string {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = (day.getDay() + 6) % 7;
  day.setDate(day.getDate() - weekday + 3);
  const year = day.getFullYear();
  const firstThursday = new Date(year, 0, 4);
  const firstWeekday = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - firstWeekday + 3);
  const week = 1 + Math.round((day.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${pad(year, 4)}-W${pad(week)}`;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Moves by whole months, clamping to the last day when the target month is shorter. */
export function addMonths(date: Date, months: number): Date {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(date.getDate(), lastDay));
  return target;
}

export function shiftDate(date: Date, amount: number, unit: Unit): Date {
  switch (unit) {
    case "day":
      return addDays(date, amount);
    case "week":
      return addDays(date, amount * 7);
    case "month":
      return addMonths(date, amount);
    case "year":
      return addMonths(date, amount * 12);
  }
}

/** The next given weekday strictly after `date`. */
export function nextWeekday(date: Date, weekday: number): Date {
  const ahead = (weekday - date.getDay() + 7) % 7 || 7;
  return addDays(date, ahead);
}

/** The most recent given weekday strictly before `date`. */
export function lastWeekday(date: Date, weekday: number): Date {
  const behind = (date.getDay() - weekday + 7) % 7 || 7;
  return addDays(date, -behind);
}

/** Reads a real calendar date written as `YYYY-MM-DD`; rejects impossible days. */
export function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  date.setFullYear(year);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day)
    return null;
  return date;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function unitLabel(amount: number, unit: Unit): string {
  return `${amount} ${unit}${amount === 1 ? "" : "s"}`;
}

function matchingUnits(partial: string): Unit[] {
  if (partial === "") return [...UNITS];
  const alias = UNIT_ALIASES[partial];
  if (alias) return [alias];
  return UNITS.filter((unit) => `${unit}s`.startsWith(partial));
}

function normalize(query: string): string {
  return query.toLowerCase().replace(/\s+/g, " ").trimStart();
}

interface Keyword {
  words: string;
  label: string;
  date: (now: Date) => string;
}

function keywords(): Keyword[] {
  const list: Keyword[] = [
    { words: "today", label: "Today", date: formatDate },
    { words: "tomorrow", label: "Tomorrow", date: (now) => formatDate(addDays(now, 1)) },
    { words: "yesterday", label: "Yesterday", date: (now) => formatDate(addDays(now, -1)) },
    { words: "now", label: "Now", date: formatDateTime },
    { words: "week", label: "This week", date: formatIsoWeek },
  ];
  WEEKDAYS.forEach((name, index) => {
    const upcoming = (now: Date) => formatDate(nextWeekday(now, index));
    list.push({ words: name, label: capitalize(name), date: upcoming });
    list.push({ words: `next ${name}`, label: `Next ${capitalize(name)}`, date: upcoming });
    list.push({
      words: `last ${name}`,
      label: `Last ${capitalize(name)}`,
      date: (now) => formatDate(lastWeekday(now, index)),
    });
  });
  return list;
}

const KEYWORDS = keywords();
const DEFAULT_KEYWORDS = new Set(["today", "tomorrow", "yesterday", "now"]);

function relative(query: string, now: Date): DateSuggestion[] {
  const forward = /^in (\d{1,4})(?: ?([a-z]*))?$/.exec(query);
  if (forward) {
    const amount = Number(forward[1]);
    return matchingUnits(forward[2] ?? "").map((unit) => ({
      label: `In ${unitLabel(amount, unit)}`,
      value: formatDate(shiftDate(now, amount, unit)),
    }));
  }
  const back = /^(\d{1,4})(?: ?([a-z]+))?(?: (?:a|ag|ago)?)?$/.exec(query);
  if (back && (back[2] !== undefined || query.endsWith(" "))) {
    const amount = Number(back[1]);
    return matchingUnits(back[2] ?? "").map((unit) => ({
      label: `${capitalize(unitLabel(amount, unit))} ago`,
      value: formatDate(shiftDate(now, -amount, unit)),
    }));
  }
  const offset = /^([+-])(\d{1,4})([dwmy]?)$/.exec(query);
  if (offset) {
    const sign = offset[1] === "-" ? -1 : 1;
    const amount = Number(offset[2]);
    const unit = offset[3] ? UNIT_ALIASES[offset[3]] : "day";
    const words = unitLabel(amount, unit);
    return [
      {
        label: sign > 0 ? `In ${words}` : `${capitalize(words)} ago`,
        value: formatDate(shiftDate(now, sign * amount, unit)),
      },
    ];
  }
  return [];
}

/**
 * Dates that complete an `@` query, such as `today`, `fri`, `last monday`,
 * `in 3 days`, `2 weeks ago`, `-2w`, or `2026-10-01`. Every value is built from the
 * device's local calendar, never from UTC.
 */
export function dateSuggestions(rawQuery: string, now: Date): DateSuggestion[] {
  const query = normalize(rawQuery);
  if (query === "")
    return KEYWORDS.filter((keyword) => DEFAULT_KEYWORDS.has(keyword.words)).map((keyword) => ({
      label: keyword.label,
      value: keyword.date(now),
    }));
  const exact = parseIsoDate(query.trim());
  if (exact) return [{ label: "Date", value: formatDate(exact) }];
  const matches = KEYWORDS.filter((keyword) => keyword.words.startsWith(query)).map((keyword) => ({
    label: keyword.label,
    value: keyword.date(now),
  }));
  return [...matches, ...relative(query, now)];
}
