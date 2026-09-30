import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { flush } from "solid-js";
import { createMemoryBridge } from "~/lib/desktop/memory-bridge";
import { createDesktopDirectory } from "~/lib/storage/desktop-directory";
import { createMemoryDirectory } from "~/lib/storage/directory";
import { loadLibraryLocation, resetDesktopState } from "~/state/desktop";
import { clearDocumentState, documents } from "~/state/document";
import { resetLibraryState, startLibrary, useLibraryDirectory } from "~/state/library";
import { resetWorkspaceState } from "~/state/workspace";
import FolderSettings from "./FolderSettings";

const locks = {
  request: (_name: string, task: () => Promise<unknown>) => task(),
} as unknown as Pick<LockManager, "request">;

let restore: (() => void) | undefined;

afterEach(() => {
  restore?.();
  restore = undefined;
  resetLibraryState();
  resetDesktopState();
  clearDocumentState();
  resetWorkspaceState();
});

describe("FolderSettings", () => {
  it("names the folder and shows its full path", async () => {
    const bridge = createMemoryBridge(null, {
      location: { path: "/Users/ada/Documents/emdy", name: "emdy" },
    });
    await loadLibraryLocation(bridge);
    render(() => <FolderSettings bridge={bridge} />);
    expect(screen.getByTestId("storage-location")).toHaveTextContent("emdy");
    expect(screen.getByTestId("storage-path")).toHaveTextContent("/Users/ada/Documents/emdy");
    expect(screen.getByTestId("storage-path")).toHaveAttribute(
      "title",
      "/Users/ada/Documents/emdy",
    );
  });

  it("falls back to a generic label before the location arrives", () => {
    render(() => <FolderSettings bridge={createMemoryBridge(null)} />);
    expect(screen.getByTestId("storage-location")).toHaveTextContent("Documents folder");
    expect(screen.getByTestId("storage-path")).toHaveTextContent(
      "Plain Markdown files on this computer",
    );
  });

  it("labels the reveal button for the platform's file manager", async () => {
    const user = userEvent.setup();
    const bridge = createMemoryBridge(null, { platform: "win32" });
    render(() => <FolderSettings bridge={bridge} />);
    await user.click(screen.getByRole("button", { name: "Show in File Explorer" }));
    expect(bridge.revealed()).toBe(1);
  });

  it("switches the library to a newly chosen folder", async () => {
    const user = userEvent.setup();
    const first = createMemoryDirectory({ "Old.md": "# Old" });
    const bridge = createMemoryBridge(first);
    restore = useLibraryDirectory(() => createDesktopDirectory(bridge, locks));
    await startLibrary();
    flush();
    const next = createMemoryDirectory({ "New.md": "# New" });
    bridge.setChoice({ path: "/Users/ada/New", name: "New" });
    const choose = bridge.library.choose;
    bridge.library.choose = async () => {
      const chosen = await choose();
      bridge.setRoot(next);
      return chosen;
    };
    render(() => <FolderSettings bridge={bridge} />);
    await user.click(screen.getByRole("button", { name: "Change folder…" }));
    await vi.waitFor(() => {
      flush();
      expect(documents().map((doc) => doc.title)).toEqual(["New"]);
    });
    expect(screen.getByTestId("storage-location")).toHaveTextContent("New");
    expect(screen.getByTestId("storage-path")).toHaveTextContent("/Users/ada/New");
  });
});
