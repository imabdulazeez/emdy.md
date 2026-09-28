import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { flush, Show } from "solid-js";
import { serializeArchive } from "~/lib/storage/archive";
import { createMemoryDirectory, type MemoryDirectory } from "~/lib/storage/directory";
import { seedDirectory } from "~/lib/storage/fixtures";
import { TEST_DOCUMENTS } from "~/test-documents";
import { clearDocumentState, documents, hasDocuments } from "~/state/document";
import {
  importStatus,
  resetLibraryState,
  startLibrary,
  useLibraryDirectory,
} from "~/state/library";
import EmptyLibrary from "./EmptyLibrary";
import LibrarySettings from "./LibrarySettings";
import { SidebarProvider } from "./ui/sidebar";

let restore: (() => void) | undefined;
let directory: MemoryDirectory;

beforeEach(async () => {
  directory = createMemoryDirectory();
  await seedDirectory(directory, TEST_DOCUMENTS);
  restore = useLibraryDirectory(async () => directory);
  await startLibrary();
  flush();
});

afterEach(() => {
  restore?.();
  restore = undefined;
  resetLibraryState();
  clearDocumentState();
});

describe("LibrarySettings", () => {
  it("opens the file picker and imports the chosen export", async () => {
    const user = userEvent.setup();
    render(() => <LibrarySettings />);
    const input = screen.getByLabelText<HTMLInputElement>("Import documents file");
    const click = vi.spyOn(input, "click");
    await user.click(screen.getByRole("button", { name: "Import documents…" }));
    expect(click).toHaveBeenCalledTimes(1);
    const text = serializeArchive(
      [{ id: "abc123", title: "Imported", text: "one", created: 1, modified: 2 }],
      3,
    );
    await user.upload(input, new File([text], "emdy.json", { type: "application/json" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Imported 1 document.");
    expect(documents().map((doc) => doc.title)).toContain("Imported");
    expect(directory.files()["Imported.md"]).toBe("one");
  });

  it("reports a file that is not an export and can dismiss the message", async () => {
    const user = userEvent.setup();
    render(() => <LibrarySettings />);
    const input = screen.getByLabelText<HTMLInputElement>("Import documents file");
    await user.upload(input, new File(["[]"], "list.json", { type: "application/json" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This file isn’t an emdy export.");
    expect(documents()).toHaveLength(TEST_DOCUMENTS.length);
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(importStatus()).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not show an import made from the welcome sheet", async () => {
    const user = userEvent.setup();
    restore?.();
    clearDocumentState();
    resetLibraryState();
    restore = useLibraryDirectory(async () => createMemoryDirectory());
    await startLibrary();
    flush();
    const { unmount } = render(() => (
      <SidebarProvider open onOpenChange={() => {}}>
        <Show when={hasDocuments()} fallback={<EmptyLibrary />}>
          <span data-testid="library-open" />
        </Show>
      </SidebarProvider>
    ));
    const text = serializeArchive(
      [{ id: "abc123", title: "Imported", text: "one", created: 1, modified: 2 }],
      3,
    );
    await user.upload(
      screen.getByLabelText("Import documents file"),
      new File([text], "emdy.json", { type: "application/json" }),
    );
    await screen.findByTestId("library-open");
    await vi.waitFor(() => expect(importStatus()).not.toBeNull());
    unmount();

    render(() => <LibrarySettings />);
    flush();
    expect(screen.queryByTestId("import-status")).toBeNull();
    expect(importStatus()).toBeNull();
  });

  it("downloads every document as a JSON export", async () => {
    const user = userEvent.setup();
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((blob: Blob) => {
      blobs.push(blob);
      return "blob:emdy";
    });
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    try {
      render(() => <LibrarySettings />);
      await user.click(screen.getByRole("button", { name: "Export all documents" }));
      await vi.waitFor(() => expect(click).toHaveBeenCalledTimes(1));
      const anchor = click.mock.contexts[0] as HTMLAnchorElement;
      expect(anchor.download).toMatch(/^emdy-\d{4}-\d{2}-\d{2}\.json$/);
      const archive = JSON.parse(await blobs[0].text()) as {
        format: string;
        documents: { id: string }[];
      };
      expect(archive.format).toBe("emdy-library");
      expect(archive.documents.map((doc) => doc.id)).toEqual(TEST_DOCUMENTS.map((doc) => doc.id));
    } finally {
      click.mockRestore();
    }
  });
});
