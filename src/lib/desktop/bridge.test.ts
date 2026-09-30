import { describe, expect, it } from "vite-plus/test";
import { isNotFoundError } from "../storage/directory";
import {
  applyDesktopAttribute,
  DESKTOP_BRIDGE_KEY,
  desktopBridge,
  isDesktop,
  revealLabel,
  unwrapFolderResult,
} from "./bridge";
import { createMemoryBridge } from "./memory-bridge";

describe("desktopBridge", () => {
  it("returns the bridge the preload script exposed", () => {
    const bridge = createMemoryBridge(null);
    const host = { [DESKTOP_BRIDGE_KEY]: bridge };
    expect(desktopBridge(host)).toBe(bridge);
    expect(isDesktop(host)).toBe(true);
  });

  it("reports the browser when no bridge is exposed", () => {
    expect(desktopBridge({})).toBeNull();
    expect(desktopBridge({ [DESKTOP_BRIDGE_KEY]: "nope" })).toBeNull();
    expect(desktopBridge(undefined)).toBeNull();
    expect(isDesktop({})).toBe(false);
    expect(isDesktop()).toBe(false);
  });
});

describe("applyDesktopAttribute", () => {
  it("marks the root with the desktop platform", () => {
    const root = document.createElement("html");
    applyDesktopAttribute(root, createMemoryBridge(null, { platform: "darwin" }));
    expect(root.dataset.desktop).toBe("darwin");
    applyDesktopAttribute(root, createMemoryBridge(null, { platform: "win32" }));
    expect(root.dataset.desktop).toBe("win32");
  });

  it("leaves the root unmarked in the browser", () => {
    const root = document.createElement("html");
    root.dataset.desktop = "darwin";
    applyDesktopAttribute(root, null);
    expect(root.dataset.desktop).toBeUndefined();
    applyDesktopAttribute();
    expect(document.documentElement.dataset.desktop).toBeUndefined();
  });
});

describe("revealLabel", () => {
  it("names each platform's file manager", () => {
    expect(revealLabel("darwin")).toBe("Show in Finder");
    expect(revealLabel("win32")).toBe("Show in File Explorer");
    expect(revealLabel("linux")).toBe("Open folder");
  });
});

describe("unwrapFolderResult", () => {
  it("returns the value of a successful result", () => {
    expect(unwrapFolderResult({ ok: true, value: 3 })).toBe(3);
  });

  it("rebuilds NotFoundError as a DOMException the storage layer recognises", () => {
    let caught: unknown;
    try {
      unwrapFolderResult({ ok: false, error: { name: "NotFoundError", message: "gone" } });
    } catch (error) {
      caught = error;
    }
    expect(isNotFoundError(caught)).toBe(true);
    expect((caught as Error).message).toBe("gone");
  });

  it("keeps other DOMException names and plain errors apart", () => {
    expect(() =>
      unwrapFolderResult({ ok: false, error: { name: "TypeMismatchError", message: "dir" } }),
    ).toThrow(expect.objectContaining({ name: "TypeMismatchError" }));
    let plain: unknown;
    try {
      unwrapFolderResult({ ok: false, error: { name: "Error", message: "disk full" } });
    } catch (error) {
      plain = error;
    }
    expect(plain).toBeInstanceOf(Error);
    expect(plain).not.toBeInstanceOf(DOMException);
    expect((plain as Error).message).toBe("disk full");
  });
});
