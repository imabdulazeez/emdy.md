import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import {
  dictionaryLanguage,
  dictionaryLanguages,
  pickSpellcheckLanguages,
  seedDictionaries,
} from "./dictionaries";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "emdy-dictionaries-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("dictionaryLanguage", () => {
  it("reads the language from Chromium's versioned file names", () => {
    expect(dictionaryLanguage("en-US-10-1.bdic")).toBe("en-US");
    expect(dictionaryLanguage("en-GB-oxendict-10-1.bdic")).toBe("en-GB-oxendict");
    expect(dictionaryLanguage("sh-4-0.bdic")).toBe("sh");
    expect(dictionaryLanguage("COPYING")).toBeNull();
    expect(dictionaryLanguage("en-US.bdic")).toBeNull();
  });

  it("lists each language once, sorted", () => {
    expect(dictionaryLanguages(["sh-4-0.bdic", "sh-3-0.bdic", "en-US-10-1.bdic", "x.txt"])).toEqual(
      ["en-US", "sh"],
    );
  });
});

describe("pickSpellcheckLanguages", () => {
  const available = ["de-DE", "en-AU", "en-GB", "en-US", "fr-FR"];

  it("follows the system's preferred languages", () => {
    expect(pickSpellcheckLanguages(["en-GB", "de-DE"], available)).toEqual(["en-GB", "de-DE"]);
    expect(pickSpellcheckLanguages(["EN-gb"], available)).toEqual(["en-GB"]);
  });

  it("falls back from a regional preference to any dictionary for the language", () => {
    expect(pickSpellcheckLanguages(["fr-CA"], available)).toEqual(["fr-FR"]);
    expect(pickSpellcheckLanguages(["de"], available)).toEqual(["de-DE"]);
  });

  it("never lists a language twice", () => {
    expect(pickSpellcheckLanguages(["fr-CA", "fr-BE", "fr"], available)).toEqual(["fr-FR"]);
  });

  it("uses US English, or the first bundled dictionary, when nothing matches", () => {
    expect(pickSpellcheckLanguages(["ja-JP"], available)).toEqual(["en-US"]);
    expect(pickSpellcheckLanguages([], ["fr-FR", "de-DE"])).toEqual(["fr-FR"]);
    expect(pickSpellcheckLanguages(["ja-JP"], [])).toEqual([]);
  });
});

describe("seedDictionaries", () => {
  it("copies bundled dictionaries where Chromium looks before downloading", async () => {
    const source = join(dir, "bundled");
    const target = join(dir, "userData", "Dictionaries");
    await mkdir(source);
    await writeFile(join(source, "en-US-10-1.bdic"), "english");
    await writeFile(join(source, "COPYING"), "license");
    expect(await seedDictionaries(source, target)).toEqual(["en-US"]);
    expect(await readdir(target)).toEqual(["en-US-10-1.bdic"]);
    expect(await readFile(join(target, "en-US-10-1.bdic"), "utf8")).toBe("english");
  });

  it("replaces a copy whose size no longer matches the bundle", async () => {
    const source = join(dir, "bundled");
    const target = join(dir, "Dictionaries");
    await mkdir(source);
    await mkdir(target);
    await writeFile(join(source, "en-US-10-1.bdic"), "fresh words");
    await writeFile(join(target, "en-US-10-1.bdic"), "old");
    await seedDictionaries(source, target);
    expect(await readFile(join(target, "en-US-10-1.bdic"), "utf8")).toBe("fresh words");
  });

  it("returns no languages when nothing is bundled", async () => {
    expect(await seedDictionaries(join(dir, "missing"), join(dir, "Dictionaries"))).toEqual([]);
  });
});
