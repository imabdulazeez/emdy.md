import { copyFile, mkdir, readdir, stat } from "node:fs/promises";
import { join } from "node:path";

const DICTIONARY_FILE = /^(.+)-\d+-\d+\.bdic$/;
export const FALLBACK_LANGUAGE = "en-US";

export function dictionaryLanguage(file: string): string | null {
  return DICTIONARY_FILE.exec(file)?.[1] ?? null;
}

export function dictionaryLanguages(files: readonly string[]): string[] {
  const languages = new Set<string>();
  for (const file of files) {
    const language = dictionaryLanguage(file);
    if (language) languages.add(language);
  }
  return Array.from(languages).sort();
}

export function pickSpellcheckLanguages(
  preferred: readonly string[],
  available: readonly string[],
): string[] {
  const chosen: string[] = [];
  const add = (language: string | undefined) => {
    if (language && !chosen.includes(language)) chosen.push(language);
  };
  for (const wanted of preferred) {
    const lower = wanted.toLowerCase();
    const exact = available.find((language) => language.toLowerCase() === lower);
    if (exact) {
      add(exact);
      continue;
    }
    const base = lower.split("-")[0];
    add(available.find((language) => language.toLowerCase().split("-")[0] === base));
  }
  if (chosen.length > 0) return chosen;
  if (available.includes(FALLBACK_LANGUAGE)) return [FALLBACK_LANGUAGE];
  return available.slice(0, 1);
}

async function sizeOf(path: string): Promise<number | null> {
  try {
    return (await stat(path)).size;
  } catch {
    return null;
  }
}

export async function seedDictionaries(source: string, target: string): Promise<string[]> {
  let files: string[];
  try {
    files = (await readdir(source)).filter((file) => dictionaryLanguage(file) !== null);
  } catch {
    return [];
  }
  await mkdir(target, { recursive: true });
  for (const file of files) {
    const from = join(source, file);
    const to = join(target, file);
    if ((await sizeOf(to)) !== (await sizeOf(from))) await copyFile(from, to);
  }
  return dictionaryLanguages(files);
}
