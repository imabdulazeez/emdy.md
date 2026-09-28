import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { flush } from "solid-js";
import { createMemoryDirectory } from "~/lib/storage/directory";
import { serializeArchive } from "~/lib/storage/archive";
import { clearDocumentState } from "~/state/document";
import {
  importLibraryFile,
  importStatus,
  resetLibraryState,
  startLibrary,
  useLibraryDirectory,
} from "~/state/library";
import ImportStatus, { describeOutcome } from "./ImportStatus";

let restore: (() => void) | undefined;

afterEach(() => {
  restore?.();
  restore = undefined;
  resetLibraryState();
  clearDocumentState();
});

const archiveFile = (text: string) => new File([text], "emdy.json", { type: "application/json" });

describe("ImportStatus", () => {
  it("renders nothing until an import has finished", () => {
    render(() => <ImportStatus />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("announces a successful import and can be dismissed", async () => {
    const user = userEvent.setup();
    restore = useLibraryDirectory(async () => createMemoryDirectory());
    await startLibrary();
    flush();
    render(() => <ImportStatus />);
    await importLibraryFile(
      archiveFile(
        serializeArchive(
          [{ id: "abc123", title: "Arrived", text: "hello", created: 1, modified: 2 }],
          3,
        ),
      ),
    );
    flush();
    expect(screen.getByRole("status")).toHaveTextContent("Imported 1 document.");
    expect(screen.queryByRole("alert")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(importStatus()).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows a rejected file as an alert", async () => {
    restore = useLibraryDirectory(async () => createMemoryDirectory());
    await startLibrary();
    flush();
    render(() => <ImportStatus />);
    await importLibraryFile(archiveFile("not json"));
    flush();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Couldn’t import documents. This file isn’t an emdy export.");
    expect(alert).toHaveClass("bg-danger-soft");
  });

  it("drops an outcome left by another view when it mounts, and its own when it unmounts", async () => {
    restore = useLibraryDirectory(async () => createMemoryDirectory());
    await startLibrary();
    flush();
    await importLibraryFile(archiveFile("not json"));
    flush();
    expect(importStatus()).not.toBeNull();
    const { unmount } = render(() => <ImportStatus />);
    flush();
    expect(importStatus()).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();

    await importLibraryFile(archiveFile("not json"));
    flush();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    unmount();
    flush();
    expect(importStatus()).toBeNull();
  });

  it("describes outcomes for both kinds", () => {
    expect(describeOutcome({ kind: "imported", imported: 2, skipped: 1 })).toBe(
      "Imported 2 documents, 1 already here.",
    );
    expect(describeOutcome({ kind: "error", message: "disk on fire" })).toBe(
      "Couldn’t import documents. disk on fire",
    );
  });
});
