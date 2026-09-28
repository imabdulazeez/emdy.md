import { CATALOG_DIRECTORY, CATALOG_FILE, entryFor, serializeCatalog } from "./catalog";
import type { MemoryDirectory } from "./directory";
import { filenameFor } from "./filenames";
import { byteLength } from "./hash";

export interface FixtureDocument {
  id: string;
  title: string;
  text: string;
}

export async function seedDirectory(
  directory: MemoryDirectory,
  documents: readonly FixtureDocument[],
): Promise<void> {
  const taken: string[] = [];
  const entries = documents.map((doc, index) => {
    const file = filenameFor(doc.title, taken);
    taken.push(file);
    directory.place(file, doc.text);
    const info = directory.info(file)!;
    return entryFor(
      doc.id,
      file,
      doc.title,
      doc.text,
      byteLength(doc.text),
      info.lastModified,
      index + 1,
      info.lastModified,
    );
  });
  const metadata = await directory.child(CATALOG_DIRECTORY);
  await metadata.write(CATALOG_FILE, serializeCatalog(entries));
}
