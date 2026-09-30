import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { unzipSync } from "fflate";
import { dictionaryLanguage } from "../dictionaries.ts";

export const APP_DIR = join("out", "desktop", "app");
export const DICTIONARY_DIR = join("out", "desktop", "dictionaries");
export const CACHE_DIR = join("node_modules", ".cache", "emdy-desktop");
export const DICTIONARY_ARCHIVE = "hunspell_dictionaries.zip";
export const DEFAULT_LANGUAGES: readonly string[] = ["en-US", "en-GB", "en-CA", "en-AU"];
export const REQUIRED_APP_FILES = ["main.mjs", "preload.cjs", join("renderer", "index.html")];
export const MAC_ICON_SOURCE = join("desktop", "resources", "icon-mac.png");
export const MAC_ICON = join("out", "desktop", "icon.icns");
export const MAC_ICON_SIZES: readonly number[] = [16, 32, 128, 256, 512];

const LICENSE_FILE = /^COPYING/;

type Run = (command: string, args: readonly string[]) => Promise<unknown>;

type Fetch = (url: string) => Promise<Pick<Response, "ok" | "status" | "arrayBuffer">>;

export interface DictionarySelection {
  dictionaries: string[];
  licenses: string[];
  missing: string[];
}

export function appManifest(pkg: Record<string, unknown>): Record<string, unknown> {
  const text = (value: unknown, fallback: string) =>
    typeof value === "string" && value ? value : fallback;
  return {
    name: "emdy",
    productName: "emdy",
    version: text(pkg.version, "0.0.0"),
    description: text(pkg.description, "A local-first Markdown editor."),
    license: text(pkg.license, "UNLICENSED"),
    ...(pkg.author ? { author: pkg.author } : {}),
    main: "main.mjs",
  };
}

export function requestedLanguages(value: string | undefined): readonly string[] | "all" {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return DEFAULT_LANGUAGES;
  if (trimmed.toLowerCase() === "all") return "all";
  if (trimmed.toLowerCase() === "none") return [];
  return trimmed
    .split(",")
    .map((language) => language.trim())
    .filter(Boolean);
}

export function selectDictionaries(
  files: readonly string[],
  languages: readonly string[] | "all",
): DictionarySelection {
  const wanted = languages === "all" ? null : new Set(languages.map((l) => l.toLowerCase()));
  const found = new Set<string>();
  const dictionaries = files.filter((file) => {
    const language = dictionaryLanguage(file)?.toLowerCase();
    if (!language || (wanted && !wanted.has(language))) return false;
    found.add(language);
    return true;
  });
  const missing =
    languages === "all" ? [] : languages.filter((language) => !found.has(language.toLowerCase()));
  const licenses = dictionaries.length > 0 ? files.filter((file) => LICENSE_FILE.test(file)) : [];
  return { dictionaries: dictionaries.sort(), licenses: licenses.sort(), missing };
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function dictionaryArchiveUrl(version: string): string {
  return `https://github.com/electron/electron/releases/download/v${version}/${DICTIONARY_ARCHIVE}`;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function loadDictionaryArchive(options: {
  version: string;
  checksum: string;
  cacheDir: string;
  fetch?: Fetch;
}): Promise<Uint8Array> {
  const cached = join(options.cacheDir, `hunspell-${options.version}.zip`);
  if (await exists(cached)) {
    const bytes = new Uint8Array(await readFile(cached));
    if (sha256(bytes) === options.checksum) return bytes;
  }
  const url = dictionaryArchiveUrl(options.version);
  const response = await (options.fetch ?? fetch)(url);
  if (!response.ok) throw new Error(`Couldn’t download ${url} (HTTP ${response.status}).`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const actual = sha256(bytes);
  if (actual !== options.checksum)
    throw new Error(
      `${DICTIONARY_ARCHIVE} does not match Electron’s published checksum (${actual}).`,
    );
  await mkdir(options.cacheDir, { recursive: true });
  await writeFile(cached, bytes);
  return bytes;
}

export async function stageDictionaries(options: {
  root: string;
  languages: readonly string[] | "all";
  electronDir?: string;
  fetch?: Fetch;
}): Promise<string[]> {
  const target = join(options.root, DICTIONARY_DIR);
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  if (options.languages !== "all" && options.languages.length === 0) return [];
  const electronDir = options.electronDir ?? join(options.root, "node_modules", "electron");
  const { version } = JSON.parse(await readFile(join(electronDir, "package.json"), "utf8")) as {
    version: string;
  };
  const checksums = JSON.parse(await readFile(join(electronDir, "checksums.json"), "utf8")) as
    | Record<string, string>
    | undefined;
  const checksum = checksums?.[DICTIONARY_ARCHIVE];
  if (!checksum) throw new Error(`Electron ${version} publishes no checksum for dictionaries.`);
  const archive = await loadDictionaryArchive({
    version,
    checksum,
    cacheDir: join(options.root, CACHE_DIR),
    fetch: options.fetch,
  });
  const names: string[] = [];
  unzipSync(archive, {
    filter: (file) => {
      names.push(file.name);
      return false;
    },
  });
  const selection = selectDictionaries(names, options.languages);
  if (selection.missing.length > 0)
    throw new Error(
      `No bundled dictionary for ${selection.missing.join(", ")}. Available: ${names
        .map(dictionaryLanguage)
        .filter(Boolean)
        .join(", ")}.`,
    );
  const keep = new Set([...selection.dictionaries, ...selection.licenses]);
  const files = unzipSync(archive, { filter: (file) => keep.has(file.name) });
  for (const [name, bytes] of Object.entries(files)) await writeFile(join(target, name), bytes);
  return selection.dictionaries;
}

export async function stageApp(root: string): Promise<void> {
  const appDir = join(root, APP_DIR);
  const missing: string[] = [];
  for (const file of REQUIRED_APP_FILES)
    if (!(await exists(join(appDir, file)))) missing.push(file);
  if (missing.length > 0)
    throw new Error(
      `The desktop build is incomplete (missing ${missing.join(", ")}). Run \`vp build --mode desktop\` and \`vp pack\` first.`,
    );
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as Record<
    string,
    unknown
  >;
  await writeFile(join(appDir, "package.json"), `${JSON.stringify(appManifest(pkg), null, 2)}\n`);
}

export function iconsetEntries(): { name: string; size: number }[] {
  return MAC_ICON_SIZES.flatMap((size) => [
    { name: `icon_${size}x${size}.png`, size },
    { name: `icon_${size}x${size}@2x.png`, size: size * 2 },
  ]);
}

export async function stageMacIcon(options: {
  root: string;
  workDir: string;
  run: Run;
}): Promise<string> {
  const source = join(options.root, MAC_ICON_SOURCE);
  if (!(await exists(source)))
    throw new Error(`The mac icon source ${MAC_ICON_SOURCE} is missing.`);
  const iconset = join(options.workDir, "icon.iconset");
  await mkdir(iconset, { recursive: true });
  for (const { name, size } of iconsetEntries())
    await options.run("sips", [
      "-z",
      String(size),
      String(size),
      source,
      "--out",
      join(iconset, name),
    ]);
  const target = join(options.root, MAC_ICON);
  await mkdir(dirname(target), { recursive: true });
  await options.run("iconutil", ["-c", "icns", iconset, "-o", target]);
  return target;
}

async function buildMacIcon(root: string): Promise<void> {
  const workDir = await mkdtemp(join(tmpdir(), "emdy-icon-"));
  const run = promisify(execFile);
  try {
    await stageMacIcon({ root, workDir, run: (command, args) => run(command, [...args]) });
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const root = process.cwd();
  await stageApp(root);
  if (process.platform === "darwin") await buildMacIcon(root);
  const staged = await stageDictionaries({
    root,
    languages: requestedLanguages(process.env.EMDY_DICTIONARIES),
  });
  process.stdout.write(
    `Staged the desktop app with ${staged.length} spellcheck ${
      staged.length === 1 ? "dictionary" : "dictionaries"
    }.\n`,
  );
}

if (import.meta.main) await main();
