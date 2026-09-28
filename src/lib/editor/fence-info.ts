export interface FenceInfo {
  /** First token of the info string, e.g. `ts` in ```` ```ts ````. */
  language: string;
  /** Filename from `title="x.ts"`, `file=x.ts`, or a bare `src/x.ts` token. */
  title: string | null;
}

const TITLE_ATTR = /(?:^|\s)(?:title|file(?:name)?)=(?:"([^"]+)"|'([^']+)'|(\S+))/i;
const FILENAME_TOKEN = /^[\w@][\w@./-]*\.[A-Za-z0-9]+$/;

/** Parses the text after a fence's backticks into a language and optional title. */
export function parseFenceInfo(info: string): FenceInfo {
  const trimmed = info.trim();
  const language = trimmed.split(/\s+/)[0] ?? "";
  const rest = trimmed.slice(language.length);
  const attr = TITLE_ATTR.exec(rest);
  const title =
    attr?.[1] ??
    attr?.[2] ??
    attr?.[3] ??
    rest.split(/\s+/).find((token) => FILENAME_TOKEN.test(token)) ??
    null;
  return { language, title };
}

/** Header label for a fenced block: the filename when given, else the language. */
export function fenceLabel(info: string): string {
  const { language, title } = parseFenceInfo(info);
  return title ?? language;
}
