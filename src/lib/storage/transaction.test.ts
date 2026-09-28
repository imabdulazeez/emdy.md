import { describe, expect, it, vi } from "vite-plus/test";
import { CATALOG_DIRECTORY, CATALOG_FILE, entryFor, parseCatalog } from "./catalog";
import { createMemoryDirectory } from "./directory";
import { hashText } from "./hash";
import {
  TRANSACTION_FILE,
  isTransaction,
  readOptional,
  recoverTransaction,
  writeTransaction,
  type Transaction,
} from "./transaction";

const transaction = (): Transaction => ({
  catalog: { version: 1, documents: [entryFor("abc123", "New.md", "New", "new", 3, 1, 1)] },
  writes: [{ file: "New.md", text: "new" }],
  removes: ["Old.md"],
  journals: [],
});

describe("document transactions", () => {
  it("validates file paths, content, catalog entries, and acknowledgements", () => {
    expect(isTransaction(transaction())).toBe(true);
    for (const invalid of [
      null,
      {},
      { ...transaction(), writes: [null] },
      { ...transaction(), writes: [{ file: "New.md", text: "wrong" }] },
      { ...transaction(), writes: [...transaction().writes, ...transaction().writes] },
      { ...transaction(), removes: ["New.md"] },
      { ...transaction(), removes: ["../old.md"] },
      { ...transaction(), journals: [{ key: "emdy:pref:theme", value: "[]" }] },
    ]) {
      expect(isTransaction(invalid)).toBe(false);
    }
  });

  it("replays an interrupted rename and edit idempotently", async () => {
    const dir = createMemoryDirectory({ "Old.md": "old" });
    const metadata = await dir.child(CATALOG_DIRECTORY);
    const pending = transaction();
    await metadata.write(TRANSACTION_FILE, JSON.stringify(pending));
    await dir.write("New.md", "new");
    const write = vi.spyOn(dir, "write");
    await recoverTransaction(dir);
    await recoverTransaction(dir);
    expect(write).not.toHaveBeenCalled();
    expect(dir.files()).toEqual({ "New.md": "new" });
    expect(parseCatalog(await metadata.read(CATALOG_FILE))?.documents[0]).toMatchObject({
      id: "abc123",
      file: "New.md",
      hash: hashText("new"),
    });
    expect(await readOptional(metadata, TRANSACTION_FILE)).toBeNull();
  });

  it("writes without reading files back and stamps only written files with their disk time", async () => {
    const dir = createMemoryDirectory({ "Old.md": "old", "Kept.md": "kept" }, () => 700);
    const read = vi.spyOn(dir, "read");
    const stat = vi.spyOn(dir, "stat");
    const kept = { ...entryFor("kept00", "Kept.md", "Kept", "kept", 4, 1, 1), synced: 5 };
    const pending = transaction();
    pending.catalog.documents.push(kept);
    const documents = await writeTransaction(dir, pending);
    expect(read).not.toHaveBeenCalled();
    expect(stat.mock.calls).toEqual([["New.md"]]);
    expect(documents).toEqual([{ ...pending.catalog.documents[0], synced: 700 }, kept]);
    const metadata = dir.childDirectory(CATALOG_DIRECTORY)!;
    expect(parseCatalog(await metadata.read(CATALOG_FILE))?.documents).toEqual([
      kept,
      documents[0],
    ]);
    expect(dir.files()).toEqual({ "New.md": "new", "Kept.md": "kept" });
  });

  it("keeps files and the recovery record when the record is corrupt", async () => {
    const dir = createMemoryDirectory({ "Old.md": "old" });
    const metadata = await dir.child(CATALOG_DIRECTORY);
    for (const raw of ["{broken", "{}"]) {
      await metadata.write(TRANSACTION_FILE, raw);
      await expect(recoverTransaction(dir)).rejects.toThrow(/pending document save/);
      expect(dir.files()).toEqual({ "Old.md": "old" });
      expect(await metadata.read(TRANSACTION_FILE)).toBe(raw);
    }
  });

  it("rejects invalid transactions before writing anything", async () => {
    const dir = createMemoryDirectory({ "Old.md": "old" });
    const invalid = { ...transaction(), removes: ["../outside.md"] };
    await expect(writeTransaction(dir, invalid)).rejects.toThrow("document save is invalid");
    expect(dir.childDirectory(CATALOG_DIRECTORY)).toBeUndefined();
    expect(dir.files()).toEqual({ "Old.md": "old" });
  });
});

it("retries an empty transaction file left by a failed first write", async () => {
  const dir = createMemoryDirectory({ "Old.md": "old" });
  const metadata = await dir.child(CATALOG_DIRECTORY);
  await metadata.write(TRANSACTION_FILE, "");
  await recoverTransaction(dir);
  expect(dir.files()).toEqual({ "Old.md": "old" });
  await writeTransaction(dir, transaction());
  expect(dir.files()).toEqual({ "New.md": "new" });
});
