import {
  CATALOG_DIRECTORY,
  CATALOG_FILE,
  isCatalog,
  serializeCatalog,
  type StoredCatalog,
  type StoredCatalogEntry,
} from "./catalog";
import { isNotFoundError, type Directory } from "./directory";
import { isMarkdownFile } from "./filenames";
import { byteLength, hashText } from "./hash";
import { acknowledgeJournal, isJournalSnapshot, type JournalSnapshot } from "./journal";

export const TRANSACTION_FILE = "pending.json";

export interface Transaction {
  catalog: StoredCatalog;
  writes: { file: string; text: string }[];
  removes: string[];
  journals: JournalSnapshot[];
}

function isFilename(value: unknown): value is string {
  return typeof value === "string" && isMarkdownFile(value) && !/[/\\\p{Cc}]/u.test(value);
}

export function isTransaction(value: unknown): value is Transaction {
  if (typeof value !== "object" || value === null) return false;
  const transaction = value as Record<string, unknown>;
  if (
    !isCatalog(transaction.catalog) ||
    !Array.isArray(transaction.writes) ||
    !Array.isArray(transaction.removes) ||
    !Array.isArray(transaction.journals)
  )
    return false;
  if (!transaction.catalog.documents.every((entry) => isFilename(entry.file))) return false;
  const entries = new Map(transaction.catalog.documents.map((entry) => [entry.file, entry]));
  if (
    !transaction.writes.every((write: unknown) => {
      if (typeof write !== "object" || write === null) return false;
      const item = write as Record<string, unknown>;
      if (!isFilename(item.file) || typeof item.text !== "string") return false;
      const entry = entries.get(item.file);
      return entry?.hash === hashText(item.text) && entry.size === byteLength(item.text);
    })
  )
    return false;
  const writes = transaction.writes as Transaction["writes"];
  return (
    new Set(writes.map((write) => write.file)).size === writes.length &&
    transaction.removes.every((file: unknown) => isFilename(file) && !entries.has(file)) &&
    transaction.journals.every(isJournalSnapshot)
  );
}

export async function readOptional(directory: Directory, name: string): Promise<string | null> {
  try {
    return await directory.read(name);
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

async function finishTransaction(
  directory: Directory,
  transaction: Transaction,
  recovering: boolean,
): Promise<StoredCatalogEntry[]> {
  const metadata = await directory.child(CATALOG_DIRECTORY);
  for (const { file, text } of transaction.writes) {
    if (!recovering || (await readOptional(directory, file)) !== text)
      await directory.write(file, text);
  }
  for (const file of transaction.removes) {
    try {
      await directory.remove(file);
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }
  const written = new Map(
    await Promise.all(
      transaction.writes.map(async ({ file }) => [file, await directory.stat(file)] as const),
    ),
  );
  const documents = transaction.catalog.documents.map((entry) => {
    const info = written.get(entry.file);
    return info ? { ...entry, synced: info.lastModified } : entry;
  });
  await metadata.write(CATALOG_FILE, serializeCatalog(documents));
  for (const journal of transaction.journals) acknowledgeJournal(journal);
  await metadata.remove(TRANSACTION_FILE);
  return documents;
}

export async function recoverTransaction(directory: Directory): Promise<void> {
  const metadata = await directory.child(CATALOG_DIRECTORY);
  const raw = await readOptional(metadata, TRANSACTION_FILE);
  if (raw === null || raw === "") return;
  let transaction: unknown;
  try {
    transaction = JSON.parse(raw);
  } catch {
    throw new Error("The pending document save could not be read. Your files have been kept.");
  }
  if (!isTransaction(transaction))
    throw new Error("The pending document save is invalid. Your files have been kept.");
  await finishTransaction(directory, transaction, true);
}

export async function writeTransaction(
  directory: Directory,
  transaction: Transaction,
): Promise<StoredCatalogEntry[]> {
  if (!isTransaction(transaction)) throw new Error("The document save is invalid.");
  const metadata = await directory.child(CATALOG_DIRECTORY);
  await metadata.write(TRANSACTION_FILE, JSON.stringify(transaction));
  return finishTransaction(directory, transaction, false);
}
