import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { flush } from "solid-js";
import { serializeArchive } from "~/lib/storage/archive";
import { createMemoryDirectory, type MemoryDirectory } from "~/lib/storage/directory";
import {
  activeDocumentId,
  clearDocumentState,
  documents,
  hasDocuments,
  title,
} from "~/state/document";
import { resetEditorApiState } from "~/state/editor-api";
import { layoutMode, resetLayoutState, setLayoutMode } from "~/state/layout";
import { resetLibraryState, startLibrary, useLibraryDirectory } from "~/state/library";
import { resetUiState, setSidebarOpen, sidebarOpen, editorFocusRequested } from "~/state/ui";
import EmptyLibrary from "./EmptyLibrary";
import { SidebarProvider } from "./ui/sidebar";

let restore: (() => void) | undefined;
let directory: MemoryDirectory;

beforeEach(async () => {
  directory = createMemoryDirectory();
  restore = useLibraryDirectory(async () => directory);
  await startLibrary();
  flush();
});

afterEach(() => {
  restore?.();
  restore = undefined;
  resetLibraryState();
  clearDocumentState();
  resetEditorApiState();
  resetLayoutState();
  resetUiState();
});

function mount() {
  return render(() => (
    <SidebarProvider open={sidebarOpen()} onOpenChange={setSidebarOpen}>
      <EmptyLibrary />
    </SidebarProvider>
  ));
}

describe("EmptyLibrary", () => {
  it("welcomes the user with the two ways to get a first document", () => {
    mount();
    expect(screen.getByRole("heading", { name: "Welcome to emdy", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("banner", { name: "Toolbar" })).toContainElement(
      screen.getByRole("button", { name: "Hide sidebar" }),
    );
    expect(screen.getByRole("button", { name: "New document" })).toHaveClass("button-primary");
    expect(screen.getByRole("button", { name: "Import documents…" })).toHaveClass("button-quiet");
    expect(screen.getByLabelText("Import documents file")).toBeInTheDocument();
    expect(hasDocuments()).toBe(false);
  });

  it("creates the first document and hands focus to the editor", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "New document" }));
    expect(documents()).toHaveLength(1);
    expect(activeDocumentId()).toBe(documents()[0].id);
    expect(title()).toBe("Untitled");
    expect(editorFocusRequested()).toBe(true);
  });

  it("leaves Read-only preview so the first document opens ready to type", async () => {
    const user = userEvent.setup();
    flush(() => setLayoutMode("reader"));
    mount();
    await user.click(screen.getByRole("button", { name: "New document" }));
    expect(layoutMode()).toBe("editor");
    expect(editorFocusRequested()).toBe(true);
  });

  it("opens the file picker from the import button and imports the chosen file", async () => {
    const user = userEvent.setup();
    mount();
    const input = screen.getByLabelText<HTMLInputElement>("Import documents file");
    const click = vi.spyOn(input, "click");
    await user.click(screen.getByRole("button", { name: "Import documents…" }));
    expect(click).toHaveBeenCalled();
    const text = serializeArchive(
      [
        { id: "abc123", title: "First", text: "one", created: 1, modified: 2 },
        { id: "def456", title: "Second", text: "two", created: 3, modified: 4 },
      ],
      5,
    );
    await user.upload(input, new File([text], "emdy.json", { type: "application/json" }));
    await screen.findByRole("status");
    expect(screen.getByRole("status")).toHaveTextContent("Imported 2 documents.");
    expect(documents().map((doc) => doc.title)).toEqual(["First", "Second"]);
    expect(activeDocumentId()).toBe("abc123");
    expect(directory.files()).toEqual({ "First.md": "one", "Second.md": "two" });
  });

  it("reports a file that is not an export without adding anything", async () => {
    const user = userEvent.setup();
    mount();
    const input = screen.getByLabelText<HTMLInputElement>("Import documents file");
    await user.upload(input, new File(["[]"], "list.json", { type: "application/json" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This file isn’t an emdy export.");
    expect(documents()).toEqual([]);
    expect(directory.files()).toEqual({});
  });
});
