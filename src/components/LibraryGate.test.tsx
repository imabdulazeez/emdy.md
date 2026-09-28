import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { flush } from "solid-js";
import { createMemoryDirectory, type Directory } from "~/lib/storage/directory";
import { clearDocumentState, documents } from "~/state/document";
import {
  libraryStatus,
  resetLibraryState,
  startLibrary,
  useLibraryDirectory,
  type DirectorySource,
} from "~/state/library";
import { resetWorkspaceState } from "~/state/workspace";
import LibraryGate from "./LibraryGate";

let restore: (() => void) | undefined;

afterEach(() => {
  restore?.();
  restore = undefined;
  resetLibraryState();
  clearDocumentState();
  resetWorkspaceState();
});

async function boot(source: DirectorySource) {
  restore = useLibraryDirectory(source);
  await startLibrary();
  flush();
}

describe("LibraryGate", () => {
  it("renders an empty busy region while loading", () => {
    render(() => <LibraryGate />);
    const gate = screen.getByTestId("library-gate");
    expect(gate).toHaveAttribute("data-status", "loading");
    expect(gate).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders nothing over a ready library", async () => {
    await boot(async () => createMemoryDirectory());
    render(() => <LibraryGate />);
    expect(screen.getByTestId("library-gate")).toHaveAttribute("data-status", "ready");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows the failure message with a retry", async () => {
    const user = userEvent.setup();
    const directory: Directory = createMemoryDirectory({ "Mine.md": "# Mine" });
    let attempts = 0;
    await boot(async () => {
      attempts++;
      if (attempts === 1) throw new Error("storage unavailable");
      return directory;
    });
    render(() => <LibraryGate />);
    expect(screen.getByTestId("library-gate")).toHaveAttribute("data-status", "error");
    expect(
      screen.getByRole("heading", { name: "Couldn’t open your documents" }),
    ).toBeInTheDocument();
    expect(screen.getByText("storage unavailable")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await vi.waitFor(() => expect(libraryStatus()).toEqual({ kind: "ready" }));
    expect(documents().map((doc) => doc.title)).toEqual(["Mine"]);
  });
});
