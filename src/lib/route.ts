export const DOCUMENT_ID_LENGTH = 6;
export const DOCUMENT_ROUTE_PREFIX = "/d/";
export const FALLBACK_HEADING_SLUG = "section";
export const SETTINGS_PATH = "/settings";
export const SETTINGS_HREF = `/#${SETTINGS_PATH}`;

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const ID_PATTERN = /^[a-z0-9]{6}$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 60;

export interface DocumentRoute {
  id: string;
  heading: string | null;
}

export interface DocumentHrefOptions {
  search?: string;
  heading?: string | null;
}

export function isDocumentId(value: string): boolean {
  return ID_PATTERN.test(value);
}

export function isHeadingSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}

export function makeDocumentId(taken: Iterable<string> = []): string {
  const used = new Set(taken);
  const bytes = new Uint8Array(DOCUMENT_ID_LENGTH);
  for (;;) {
    crypto.getRandomValues(bytes);
    let id = "";
    for (const byte of bytes) id += ID_ALPHABET[byte % ID_ALPHABET.length];
    if (!used.has(id)) return id;
  }
}

export function slugify(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length <= MAX_SLUG_LENGTH) return slug;
  const cut = slug.slice(0, MAX_SLUG_LENGTH);
  const boundary = cut.lastIndexOf("-");
  return boundary > 0 ? cut.slice(0, boundary) : cut;
}

export function headingSlugs(headings: readonly { text: string }[]): string[] {
  const counts = new Map<string, number>();
  return headings.map((heading) => {
    const base = slugify(heading.text) || FALLBACK_HEADING_SLUG;
    const seen = counts.get(base) ?? 0;
    counts.set(base, seen + 1);
    return seen === 0 ? base : `${base}-${seen + 1}`;
  });
}

export function documentPath(
  doc: { id: string; title: string },
  heading: string | null = null,
): string {
  const slug = slugify(doc.title);
  const base = `${DOCUMENT_ROUTE_PREFIX}${slug ? `${slug}-` : ""}${doc.id}`;
  return heading ? `${base}/${heading}` : base;
}

export function documentHref(
  doc: { id: string; title: string },
  options: DocumentHrefOptions = {},
): string {
  return `/${options.search ?? ""}#${documentPath(doc, options.heading)}`;
}

export function parseDocumentRoute(path: string): DocumentRoute | null {
  if (!path.startsWith(DOCUMENT_ROUTE_PREFIX)) return null;
  const [segment, heading, ...rest] = path.slice(DOCUMENT_ROUTE_PREFIX.length).split("/");
  if (rest.length > 0) return null;
  if (heading !== undefined && !isHeadingSlug(heading)) return null;
  const id = segment.slice(-DOCUMENT_ID_LENGTH);
  if (!isDocumentId(id)) return null;
  if (
    segment.length > DOCUMENT_ID_LENGTH &&
    segment[segment.length - DOCUMENT_ID_LENGTH - 1] !== "-"
  ) {
    return null;
  }
  return { id, heading: heading ?? null };
}

export function isSettingsLocation(hash: string): boolean {
  return hash === `#${SETTINGS_PATH}` || hash === `#${SETTINGS_PATH}/`;
}

export function parseDocumentLocation(hash: string): DocumentRoute | null {
  return hash.length > 1 ? parseDocumentRoute(hash.slice(1)) : null;
}
