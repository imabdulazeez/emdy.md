import { unzipSync, strFromU8 } from "fflate";
import { flush } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createRenderer } from "~/lib/markdown/renderer";
import { resetRenderClient } from "~/lib/preview/render-client";
import { TEST_DOCUMENTS } from "~/test-documents";
import { clearDocumentState, resetDocumentState } from "./document";
import { registerEditorApi, resetEditorApiState } from "./editor-api";
import { resetPreferences } from "./preferences";
import { setDocumentFont } from "./typography";
import {
  activeExportTarget,
  EXPORT_FORMATS,
  exportActiveDocument,
  exportDocument,
  exportError,
  type ExportHost,
  prepareExport,
  resetExportState,
} from "./export";

const renderer = createRenderer();

function fakeHost(printResult: () => Promise<void> = async () => {}) {
  const downloads: { name: string; blob: Blob }[] = [];
  const prints: { title: string; html: string }[] = [];
  const render = vi.fn(async (text: string) => renderer.render(text));
  const host: ExportHost = {
    render,
    download: (name, blob) => {
      downloads.push({ name, blob });
    },
    print: (title, html) => {
      prints.push({ title, html });
      return printResult();
    },
  };
  return { host, render, downloads, prints };
}

afterEach(() => {
  clearDocumentState();
  resetEditorApiState();
  resetExportState();
  flush(() => resetPreferences());
});

describe("EXPORT_FORMATS", () => {
  it("offers Markdown, Word, and PDF in that order", () => {
    expect(EXPORT_FORMATS.map((format) => format.id)).toEqual(["markdown", "docx", "pdf"]);
    expect(EXPORT_FORMATS.map((format) => format.label)).toEqual([
      "Markdown (.md)",
      "Word document (.docx)",
      "PDF…",
    ]);
  });
});

describe("exportDocument", () => {
  const target = { title: "Weekly sync: notes", text: "# Hello\n\nWorld **bold**\n" };

  it("downloads the raw text as a markdown file named after the title", async () => {
    const { host, render, downloads } = fakeHost();
    await exportDocument(target, "markdown", host);
    expect(downloads).toHaveLength(1);
    expect(downloads[0].name).toBe("Weekly sync notes.md");
    expect(downloads[0].blob.type).toBe("text/markdown");
    expect(await downloads[0].blob.text()).toBe(target.text);
    expect(render).not.toHaveBeenCalled();
  });

  it("renders the document and downloads a Word file", async () => {
    const { host, render, downloads } = fakeHost();
    await exportDocument(target, "docx", host);
    expect(render).toHaveBeenCalledWith(target.text);
    expect(downloads[0].name).toBe("Weekly sync notes.docx");
    expect(downloads[0].blob.type).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    const files = unzipSync(new Uint8Array(await downloads[0].blob.arrayBuffer()));
    const document = strFromU8(files["word/document.xml"]);
    expect(document).toContain('<w:pStyle w:val="Heading1"/>');
    expect(document).toContain(">Hello<");
    expect(strFromU8(files["docProps/core.xml"])).toContain(
      "<dc:title>Weekly sync: notes</dc:title>",
    );
  });

  it("writes the Word file in the chosen document font", async () => {
    flush(() => setDocumentFont("handwriting"));
    const { host, downloads } = fakeHost();
    await exportDocument(target, "docx", host);
    const files = unzipSync(new Uint8Array(await downloads[0].blob.arrayBuffer()));
    expect(strFromU8(files["word/styles.xml"])).toContain('w:ascii="Segoe Print"');
  });

  it("renders the document and hands the html to the print flow", async () => {
    const { host, prints, downloads } = fakeHost();
    await exportDocument(target, "pdf", host);
    expect(prints).toEqual([{ title: target.title, html: renderer.render(target.text) }]);
    expect(downloads).toHaveLength(0);
  });
});

describe("activeExportTarget", () => {
  it("returns null without documents", () => {
    expect(activeExportTarget()).toBeNull();
  });

  it("uses the active document title and its text", () => {
    flush(() => resetDocumentState(TEST_DOCUMENTS));
    expect(activeExportTarget()).toEqual({
      title: TEST_DOCUMENTS[0].title,
      text: TEST_DOCUMENTS[0].text,
    });
  });

  it("prefers the live editor text over the last published snapshot", () => {
    flush(() => resetDocumentState(TEST_DOCUMENTS));
    flush(() =>
      registerEditorApi({
        scrollToLine: vi.fn(),
        focus: vi.fn(),
        getText: () => "unsaved keystrokes",
        flush: vi.fn(),
        runCommand: vi.fn(() => true),
        applyEdits: vi.fn(),
      }),
    );
    expect(activeExportTarget()?.text).toBe("unsaved keystrokes");
  });
});

describe("exportActiveDocument", () => {
  it("does nothing without an active document", async () => {
    const { host, downloads } = fakeHost();
    await expect(exportActiveDocument("markdown", host)).resolves.toBe(false);
    expect(downloads).toHaveLength(0);
  });

  it("exports the active document", async () => {
    flush(() => resetDocumentState(TEST_DOCUMENTS));
    const { host, downloads } = fakeHost();
    await expect(exportActiveDocument("markdown", host)).resolves.toBe(true);
    expect(downloads[0].name).toBe(`${TEST_DOCUMENTS[0].title}.md`);
    expect(exportError()).toBeNull();
  });

  it("records a failure message instead of throwing, and clears it on the next attempt", async () => {
    flush(() => resetDocumentState(TEST_DOCUMENTS));
    const failing = fakeHost(async () => {
      throw new Error("Couldn’t open the print preview.");
    });
    await expect(exportActiveDocument("pdf", failing.host)).resolves.toBe(false);
    flush();
    expect(exportError()).toBe("Couldn’t open the print preview.");
    const { host } = fakeHost();
    await expect(exportActiveDocument("markdown", host)).resolves.toBe(true);
    flush();
    expect(exportError()).toBeNull();
  });
});

describe("prepareExport", () => {
  afterEach(() => {
    resetRenderClient();
    vi.unstubAllGlobals();
  });

  it("starts the render worker once so exporting works after going offline", () => {
    const workers: string[] = [];
    vi.stubGlobal(
      "Worker",
      class {
        constructor(url: URL) {
          workers.push(String(url));
        }
        addEventListener() {}
        removeEventListener() {}
        postMessage() {}
        terminate() {}
      },
    );
    prepareExport();
    prepareExport();
    expect(workers).toHaveLength(1);
    expect(workers[0]).toMatch(/render\.worker/);
  });

  it("loads the Word builder ahead of use, and only once", async () => {
    vi.stubGlobal(
      "Worker",
      class {
        addEventListener() {}
        removeEventListener() {}
        postMessage() {}
        terminate() {}
      },
    );
    vi.resetModules();
    const loaded = vi.fn();
    vi.doMock("~/lib/export/docx", async (importOriginal) => {
      loaded();
      return importOriginal();
    });
    try {
      const fresh = await import("./export");
      expect(loaded).not.toHaveBeenCalled();
      fresh.prepareExport();
      fresh.prepareExport();
      await vi.waitFor(() => expect(loaded).toHaveBeenCalledTimes(1));
    } finally {
      vi.doUnmock("~/lib/export/docx");
      vi.resetModules();
    }
  });

  it("retries the Word builder after a failed load", async () => {
    vi.resetModules();
    let attempts = 0;
    vi.doMock("~/lib/export/docx", async (importOriginal) => {
      attempts++;
      if (attempts === 1) throw new Error("chunk unavailable");
      return importOriginal();
    });
    try {
      const fresh = await import("./export");
      const { host, downloads } = fakeHost();
      const target = { title: "Retry", text: "# Retry\n" };
      await expect(fresh.exportDocument(target, "docx", host)).rejects.toThrow();
      vi.resetModules();
      await fresh.exportDocument(target, "docx", host);
      expect(downloads.map((download) => download.name)).toEqual(["Retry.docx"]);
    } finally {
      vi.doUnmock("~/lib/export/docx");
      vi.resetModules();
    }
  });
});
