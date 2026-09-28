export type RecencyGroup = "today" | "yesterday" | "week" | "month" | "older";

export const RECENCY_GROUPS = ["today", "yesterday", "week", "month", "older"] as const;

export const RECENCY_LABELS: Record<RecencyGroup, string> = {
  today: "Today",
  yesterday: "Yesterday",
  week: "Last 7 days",
  month: "Last 30 days",
  older: "Older",
};

const DAY_MS = 86_400_000;

function startOfDay(time: number): number {
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * Buckets a timestamp by whole calendar days elapsed, so a document written
 * five minutes before midnight reads as "Yesterday" the moment the day turns.
 * Rounding absorbs the hour a daylight-saving change adds or removes.
 */
export function recencyGroup(modified: number, now: number): RecencyGroup {
  const days = Math.round((startOfDay(now) - startOfDay(modified)) / DAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days <= 7) return "week";
  if (days <= 30) return "month";
  return "older";
}

export interface RecencySection<T> {
  group: RecencyGroup;
  label: string;
  items: T[];
}

export function groupByRecency<T>(
  items: Iterable<T>,
  modified: (item: T) => number,
  now: number,
): RecencySection<T>[] {
  const buckets = new Map<RecencyGroup, T[]>();
  const sorted = [...items].sort((a, b) => modified(b) - modified(a));
  for (const item of sorted) {
    const group = recencyGroup(modified(item), now);
    const bucket = buckets.get(group);
    if (bucket) bucket.push(item);
    else buckets.set(group, [item]);
  }
  const sections: RecencySection<T>[] = [];
  for (const group of RECENCY_GROUPS) {
    const items = buckets.get(group);
    if (items) sections.push({ group, label: RECENCY_LABELS[group], items });
  }
  return sections;
}

export function sameSections<T>(
  a: readonly RecencySection<T>[],
  b: readonly RecencySection<T>[],
  same: (x: T, y: T) => boolean,
): boolean {
  return (
    a.length === b.length &&
    a.every((section, index) => {
      const other = b[index];
      return (
        section.group === other.group &&
        section.items.length === other.items.length &&
        section.items.every((item, position) => same(item, other.items[position]))
      );
    })
  );
}

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const monthDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const monthDayYear = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});
const fullStamp = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

export function formatEdited(modified: number, now: number): string {
  const elapsed = now - modified;
  if (elapsed < MINUTE_MS) return "Edited just now";
  if (elapsed < HOUR_MS) return `Edited ${Math.floor(elapsed / MINUTE_MS)}m ago`;
  const group = recencyGroup(modified, now);
  if (group === "today") return `Edited ${Math.floor(elapsed / HOUR_MS)}h ago`;
  if (group === "yesterday") return "Edited yesterday";
  const sameYear = new Date(modified).getFullYear() === new Date(now).getFullYear();
  return `Edited ${(sameYear ? monthDay : monthDayYear).format(modified)}`;
}

export function formatEditedStamp(modified: number): string {
  return `Last edited ${fullStamp.format(modified)}`;
}
