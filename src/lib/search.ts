export interface SearchExcerpt {
  before: string;
  match: string;
  after: string;
}

export interface ContentMatch<T> {
  item: T;
  excerpt: SearchExcerpt;
}

export interface SearchResults<T> {
  titles: T[];
  contents: ContentMatch<T>[];
}

export interface Searchable {
  title: string;
  text: string;
}

const CONTEXT_BEFORE = 24;
const CONTEXT_AFTER = 80;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function collapse(value: string): string {
  return value.replace(/\s+/g, " ");
}

export function normalizeQuery(query: string): string {
  return collapse(query).trim();
}

export function matcher(query: string): RegExp | null {
  const normalized = normalizeQuery(query);
  if (!normalized) return null;
  return new RegExp(escapeRegExp(normalized).replace(/ /g, "\\s+"), "iu");
}

export function excerptAround(text: string, index: number, length: number): SearchExcerpt {
  const start = Math.max(0, index - CONTEXT_BEFORE);
  const end = Math.min(text.length, index + length + CONTEXT_AFTER);
  const before = collapse(text.slice(start, index)).trimStart();
  const after = collapse(text.slice(index + length, end)).trimEnd();
  return {
    before: start > 0 ? `…${before}` : before,
    match: collapse(text.slice(index, index + length)),
    after: end < text.length ? `${after}…` : after,
  };
}

export function searchDocuments<T extends Searchable>(
  items: Iterable<T>,
  query: string,
): SearchResults<T> {
  const results: SearchResults<T> = { titles: [], contents: [] };
  const pattern = matcher(query);
  if (!pattern) return results;
  for (const item of items) {
    if (pattern.test(item.title)) {
      results.titles.push(item);
      continue;
    }
    const found = pattern.exec(item.text);
    if (found) {
      results.contents.push({
        item,
        excerpt: excerptAround(item.text, found.index, found[0].length),
      });
    }
  }
  return results;
}
