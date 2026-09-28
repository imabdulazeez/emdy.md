import { describe, expect, it } from "vite-plus/test";
import { CATALOG_DIRECTORY, CATALOG_FILE, parseCatalog } from "./catalog";
import { createMemoryDirectory } from "./directory";
import { seedDirectory } from "./fixtures";
import { createLibrary } from "./library";

describe("seedDirectory", () => {
  it("places files with a catalog whose ids survive a library load", async () => {
    const dir = createMemoryDirectory();
    await seedDirectory(dir, [
      { id: "first0", title: "First: note", text: "# First" },
      { id: "second", title: "First: note", text: "# Second" },
    ]);
    expect(dir.files()).toEqual({ "First note.md": "# First", "First note 2.md": "# Second" });
    const catalog = parseCatalog(dir.childDirectory(CATALOG_DIRECTORY)!.files()[CATALOG_FILE]);
    expect(catalog?.documents.map((entry) => [entry.id, entry.file, entry.created])).toEqual([
      ["first0", "First note.md", 1],
      ["second", "First note 2.md", 2],
    ]);
    const loaded = await createLibrary(dir).load();
    expect(loaded.map((doc) => [doc.id, doc.title, doc.text])).toEqual([
      ["first0", "First: note", "# First"],
      ["second", "First: note", "# Second"],
    ]);
  });
});
