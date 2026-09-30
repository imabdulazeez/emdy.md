import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import {
  APP_DIR,
  CACHE_DIR,
  DEFAULT_LANGUAGES,
  DICTIONARY_DIR,
  MAC_ICON,
  MAC_ICON_SOURCE,
  appManifest,
  dictionaryArchiveUrl,
  iconsetEntries,
  loadDictionaryArchive,
  requestedLanguages,
  selectDictionaries,
  sha256,
  stageApp,
  stageDictionaries,
  stageMacIcon,
} from "./stage";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "emdy-stage-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const archive = zipSync({
  "en-US-10-1.bdic": strToU8("us words"),
  "en-GB-10-1.bdic": strToU8("gb words"),
  "de-DE-3-0.bdic": strToU8("german words"),
  COPYING: strToU8("license"),
  "COPYING.LGPL": strToU8("lgpl"),
});

function respond(bytes: Uint8Array, ok = true) {
  return vi.fn(async () => ({
    ok,
    status: ok ? 200 : 404,
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
  }));
}

async function fakeElectron(checksum: string | null): Promise<string> {
  const dir = join(root, "node_modules", "electron");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "package.json"), JSON.stringify({ version: "44.4.5" }));
  await writeFile(
    join(dir, "checksums.json"),
    JSON.stringify(checksum ? { "hunspell_dictionaries.zip": checksum } : {}),
  );
  return dir;
}

describe("appManifest", () => {
  it("names the app and points Electron at the bundled main process", () => {
    expect(
      appManifest({
        name: "emdy-md",
        version: "1.2.3",
        description: "Editor",
        license: "MIT",
        dependencies: { "solid-js": "^2" },
      }),
    ).toEqual({
      name: "emdy",
      productName: "emdy",
      version: "1.2.3",
      description: "Editor",
      license: "MIT",
      main: "main.mjs",
    });
  });

  it("fills in what the root package leaves out", () => {
    expect(appManifest({ author: { name: "Ada" } })).toMatchObject({
      version: "0.0.0",
      license: "UNLICENSED",
      author: { name: "Ada" },
    });
  });
});

describe("requestedLanguages", () => {
  it("bundles English by default and reads an explicit list", () => {
    expect(requestedLanguages(undefined)).toBe(DEFAULT_LANGUAGES);
    expect(requestedLanguages("  ")).toBe(DEFAULT_LANGUAGES);
    expect(requestedLanguages("en-US, fr-FR,,de-DE")).toEqual(["en-US", "fr-FR", "de-DE"]);
    expect(requestedLanguages("ALL")).toBe("all");
    expect(requestedLanguages("none")).toEqual([]);
  });
});

describe("selectDictionaries", () => {
  const files = ["en-US-10-1.bdic", "de-DE-3-0.bdic", "COPYING", "COPYING.LGPL", "README"];

  it("keeps the requested languages and their licences", () => {
    expect(selectDictionaries(files, ["en-us"])).toEqual({
      dictionaries: ["en-US-10-1.bdic"],
      licenses: ["COPYING", "COPYING.LGPL"],
      missing: [],
    });
  });

  it("reports languages the archive lacks", () => {
    expect(selectDictionaries(files, ["en-US", "xx-XX"]).missing).toEqual(["xx-XX"]);
  });

  it("takes every dictionary for all, and no licences for none", () => {
    expect(selectDictionaries(files, "all").dictionaries).toEqual([
      "de-DE-3-0.bdic",
      "en-US-10-1.bdic",
    ]);
    expect(selectDictionaries(files, [])).toEqual({ dictionaries: [], licenses: [], missing: [] });
  });
});

describe("loadDictionaryArchive", () => {
  it("downloads Electron's dictionaries once, verifies them, and reuses the cache", async () => {
    const fetch = respond(archive);
    const options = { version: "44.4.5", checksum: sha256(archive), cacheDir: root, fetch };
    expect(await loadDictionaryArchive(options)).toEqual(archive);
    expect(fetch).toHaveBeenCalledWith(dictionaryArchiveUrl("44.4.5"));
    expect(await loadDictionaryArchive(options)).toEqual(archive);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("refuses an archive whose checksum does not match", async () => {
    await expect(
      loadDictionaryArchive({
        version: "44.4.5",
        checksum: "0".repeat(64),
        cacheDir: root,
        fetch: respond(archive),
      }),
    ).rejects.toThrow(/published checksum/);
    expect(await readdir(root)).toEqual([]);
  });

  it("downloads again when the cached copy is corrupt", async () => {
    await writeFile(join(root, "hunspell-44.4.5.zip"), "garbage");
    const fetch = respond(archive);
    await loadDictionaryArchive({
      version: "44.4.5",
      checksum: sha256(archive),
      cacheDir: root,
      fetch,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("reports a failed download", async () => {
    await expect(
      loadDictionaryArchive({
        version: "44.4.5",
        checksum: sha256(archive),
        cacheDir: root,
        fetch: respond(archive, false),
      }),
    ).rejects.toThrow(/HTTP 404/);
  });

  it("points at the release matching the installed Electron", () => {
    expect(dictionaryArchiveUrl("44.4.5")).toBe(
      "https://github.com/electron/electron/releases/download/v44.4.5/hunspell_dictionaries.zip",
    );
  });
});

describe("stageDictionaries", () => {
  it("extracts the chosen dictionaries and licences for packaging", async () => {
    const electronDir = await fakeElectron(sha256(archive));
    const staged = await stageDictionaries({
      root,
      languages: ["en-US", "en-GB"],
      electronDir,
      fetch: respond(archive),
    });
    expect(staged).toEqual(["en-GB-10-1.bdic", "en-US-10-1.bdic"]);
    const target = join(root, DICTIONARY_DIR);
    expect((await readdir(target)).sort()).toEqual([
      "COPYING",
      "COPYING.LGPL",
      "en-GB-10-1.bdic",
      "en-US-10-1.bdic",
    ]);
    expect(await readFile(join(target, "en-US-10-1.bdic"), "utf8")).toBe("us words");
    expect(await readdir(join(root, CACHE_DIR))).toEqual(["hunspell-44.4.5.zip"]);
  });

  it("clears old dictionaries and downloads nothing when none are wanted", async () => {
    const target = join(root, DICTIONARY_DIR);
    await mkdir(target, { recursive: true });
    await writeFile(join(target, "stale-1-0.bdic"), "old");
    const fetch = respond(archive);
    expect(await stageDictionaries({ root, languages: [], fetch })).toEqual([]);
    expect(await readdir(target)).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fails loudly for a language Electron does not ship", async () => {
    const electronDir = await fakeElectron(sha256(archive));
    await expect(
      stageDictionaries({ root, languages: ["tlh"], electronDir, fetch: respond(archive) }),
    ).rejects.toThrow(/No bundled dictionary for tlh\. Available: en-US, en-GB, de-DE/);
  });

  it("fails when Electron publishes no checksum to verify against", async () => {
    const electronDir = await fakeElectron(null);
    await expect(
      stageDictionaries({ root, languages: ["en-US"], electronDir, fetch: respond(archive) }),
    ).rejects.toThrow(/no checksum/);
  });
});

describe("stageApp", () => {
  it("writes the app manifest next to the built main process", async () => {
    const appDir = join(root, APP_DIR);
    await mkdir(join(appDir, "renderer"), { recursive: true });
    await writeFile(join(appDir, "main.mjs"), "");
    await writeFile(join(appDir, "preload.cjs"), "");
    await writeFile(join(appDir, "renderer", "index.html"), "");
    await writeFile(join(root, "package.json"), JSON.stringify({ version: "2.0.0" }));
    await stageApp(root);
    const manifest = JSON.parse(await readFile(join(appDir, "package.json"), "utf8"));
    expect(manifest).toMatchObject({ name: "emdy", version: "2.0.0", main: "main.mjs" });
  });

  it("explains which build step is missing", async () => {
    await mkdir(join(root, APP_DIR), { recursive: true });
    await writeFile(join(root, APP_DIR, "main.mjs"), "");
    await expect(stageApp(root)).rejects.toThrow(
      /missing preload\.cjs, renderer\/index\.html.*vp build --mode desktop/,
    );
  });
});

describe("iconsetEntries", () => {
  it("lists every size iconutil expects, each with its retina twin", () => {
    expect(iconsetEntries()).toEqual([
      { name: "icon_16x16.png", size: 16 },
      { name: "icon_16x16@2x.png", size: 32 },
      { name: "icon_32x32.png", size: 32 },
      { name: "icon_32x32@2x.png", size: 64 },
      { name: "icon_128x128.png", size: 128 },
      { name: "icon_128x128@2x.png", size: 256 },
      { name: "icon_256x256.png", size: 256 },
      { name: "icon_256x256@2x.png", size: 512 },
      { name: "icon_512x512.png", size: 512 },
      { name: "icon_512x512@2x.png", size: 1024 },
    ]);
  });
});

describe("stageMacIcon", () => {
  it("resizes the mac icon into an iconset and packs it with iconutil", async () => {
    await mkdir(join(root, "desktop", "resources"), { recursive: true });
    await writeFile(join(root, MAC_ICON_SOURCE), "png");
    const workDir = join(root, "work");
    const run = vi.fn(async () => undefined);
    const target = await stageMacIcon({ root, workDir, run });
    const iconset = join(workDir, "icon.iconset");
    expect(target).toBe(join(root, MAC_ICON));
    expect(run).toHaveBeenCalledTimes(iconsetEntries().length + 1);
    expect(run).toHaveBeenNthCalledWith(1, "sips", [
      "-z",
      "16",
      "16",
      join(root, MAC_ICON_SOURCE),
      "--out",
      join(iconset, "icon_16x16.png"),
    ]);
    expect(run).toHaveBeenLastCalledWith("iconutil", ["-c", "icns", iconset, "-o", target]);
    expect(await readdir(join(root, "out", "desktop"))).toEqual([]);
  });

  it("fails clearly when the icon source is missing", async () => {
    const run = vi.fn(async () => undefined);
    await expect(stageMacIcon({ root, workDir: join(root, "work"), run })).rejects.toThrow(
      MAC_ICON_SOURCE,
    );
    expect(run).not.toHaveBeenCalled();
  });
});
