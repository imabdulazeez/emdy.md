export interface DocumentStats {
  words: number;
  characters: number;
  readingMinutes: number;
}

export const WORDS_PER_MINUTE = 225;

const WORD_RE = /[\p{L}\p{N}]+(?:['’.\-_][\p{L}\p{N}]+)*/gu;

export function countWords(text: string): number {
  if (!text) return 0;
  return text.match(WORD_RE)?.length ?? 0;
}

export function countCharacters(text: string): number {
  return text.length;
}

export function readingTime(words: number, wordsPerMinute = WORDS_PER_MINUTE): number {
  if (words <= 0) return 0;
  return Math.max(1, Math.round(words / wordsPerMinute));
}

export function formatReadingTime(minutes: number): string {
  if (minutes <= 0) return "0 min read";
  return `${minutes} min read`;
}

export function computeStats(text: string): DocumentStats {
  const words = countWords(text);
  return { words, characters: countCharacters(text), readingMinutes: readingTime(words) };
}
