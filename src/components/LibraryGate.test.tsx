import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { flush } from "solid-js";
import { createMemoryBridge } from "~/lib/desktop/memory-bridge";
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

  it("offers a retry only in the browser", async () => {
    await boot(async () => {
      throw new Error("storage unavailable");
    });
    render(() => <LibraryGate bridge={null} />);
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Choose another folder…" })).toBeNull();
  });

  it("lets the desktop app open another folder when the current one is missing", async () => {
    const user = userEvent.setup();
    const bridge = createMemoryBridge(null);
    const next = createMemoryDirectory({ "Found.md": "# Found" });
    await boot(async () => {
      throw new Error("The folder can’t be found.");
    });
    restore?.();
    restore = useLibraryDirectory(async () => next);
    bridge.setChoice({ path: "/Volumes/Notes", name: "Notes" });
    render(() => <LibraryGate bridge={bridge} />);
    await user.click(screen.getByRole("button", { name: "Choose another folder…" }));
    await vi.waitFor(() => expect(libraryStatus()).toEqual({ kind: "ready" }));
    expect(documents().map((doc) => doc.title)).toEqual(["Found"]);
  });
});
