import { describe, expect, it, vi } from "vite-plus/test";
import { downloadBlob, downloadText, REVOKE_DELAY_MS, type DownloadHost } from "./download";

function host() {
  const clicks: HTMLAnchorElement[] = [];
  const timers: { callback: () => void; delay: number }[] = [];
  const blobs: Blob[] = [];
  const anchor = document.createElement("a");
  anchor.click = () => {
    clicks.push(anchor);
  };
  const target: DownloadHost = {
    document: {
      createElement: (() => anchor) as unknown as Document["createElement"],
      body: document.body,
    },
    createObjectURL: (blob) => {
      blobs.push(blob);
      return "blob:emdy/archive";
    },
    revokeObjectURL: vi.fn(),
    setTimeout: (callback, delay) => {
      timers.push({ callback, delay });
      return 1;
    },
  };
  return { target, anchor, clicks, timers, blobs };
}

describe("downloadText", () => {
  it("clicks a hidden download link for a blob of the text and revokes the url later", async () => {
    const { target, anchor, clicks, timers, blobs } = host();
    downloadText("emdy.json", '{"a":1}', "application/json", target);
    expect(clicks).toEqual([anchor]);
    expect(anchor.download).toBe("emdy.json");
    expect(anchor.getAttribute("href")).toBe("blob:emdy/archive");
    expect(anchor.rel).toBe("noopener");
    expect(anchor.isConnected).toBe(false);
    expect(blobs).toHaveLength(1);
    expect(blobs[0].type).toBe("application/json");
    expect(await blobs[0].text()).toBe('{"a":1}');
    expect(target.revokeObjectURL).not.toHaveBeenCalled();
    expect(timers).toHaveLength(1);
    expect(timers[0].delay).toBe(REVOKE_DELAY_MS);
    timers[0].callback();
    expect(target.revokeObjectURL).toHaveBeenCalledWith("blob:emdy/archive");
  });

  it("still removes the link and schedules the revoke when the click throws", () => {
    const { target, anchor, timers } = host();
    anchor.click = () => {
      throw new Error("blocked");
    };
    expect(() => downloadText("x.json", "{}", "application/json", target)).toThrow("blocked");
    expect(anchor.isConnected).toBe(false);
    expect(timers).toHaveLength(1);
  });
});

describe("downloadBlob", () => {
  it("downloads an arbitrary blob under the given name", async () => {
    const { target, anchor, clicks, blobs } = host();
    const blob = new Blob([new Uint8Array([80, 75, 3, 4])], { type: "application/zip" });
    downloadBlob("notes.docx", blob, target);
    expect(clicks).toEqual([anchor]);
    expect(anchor.download).toBe("notes.docx");
    expect(blobs).toEqual([blob]);
    expect(new Uint8Array(await blobs[0].arrayBuffer())).toEqual(new Uint8Array([80, 75, 3, 4]));
  });
});
