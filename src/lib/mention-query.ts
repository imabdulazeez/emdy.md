// A mention starts a word: never inside an address, a path, an escape, or code.
const MENTION = /(?<![\p{L}\p{N}_@/\\.`])@((?:[^\s@`][^@\n`]{0,39})?)$/u;

export interface MentionQuery {
  /** Where the `@` sits in the text. */
  offset: number;
  query: string;
}

/** The `@` query that ends `text`, or null when the text does not end in one. */
export function mentionQuery(text: string): MentionQuery | null {
  const match = MENTION.exec(text);
  if (!match) return null;
  return { offset: text.length - match[0].length, query: match[1] };
}
