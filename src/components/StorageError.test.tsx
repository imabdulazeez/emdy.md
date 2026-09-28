import { render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { flush } from "solid-js";
import { createMemoryDirectory } from "~/lib/storage/directory";
import { clearJournal } from "~/lib/storage/journal";
import { clearDocumentState } from "~/state/document";
import {
  currentLibrary,
  resetLibraryState,
  retryLibrarySave,
  startLibrary,
  useLibraryDirectory,
} from "~/state/library";
import StorageError from "./StorageError";

let restore: (() => void) | undefined;

afterEach(() => {
  restore?.();
  resetLibraryState();
  clearDocumentState();
  clearJournal();
});

describe("StorageError", () => {
  it("stays hidden when storage has no error", () => {
    render(() => <StorageError />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows a failed save and retries it without dismissing it prematurely", async () => {
    const user = userEvent.setup();
    const directory = createMemoryDirectory();
    restore = useLibraryDirectory(async () => directory);
    await startLibrary();
    flush();
    const write = directory.write;
    directory.write = async () => {
      throw new Error("disk is full");
    };
    currentLibrary()!.save({ id: "welcom", title: "Welcome to emdy", text: "keep this edit" });
    await retryLibrarySave();
    flush();
    render(() => <StorageError />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t save your changes. disk is full");
    const gate = Promise.withResolvers<void>();
    directory.write = async (name, text) => {
      await gate.promise;
      await write(name, text);
    };
    await user.click(screen.getByRole("button", { name: "Retry save" }));
    expect(screen.getByRole("button", { name: "Retry save" })).toBeDisabled();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    gate.resolve();
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(directory.files()["Welcome to emdy.md"]).toBe("keep this edit");
  });
});
