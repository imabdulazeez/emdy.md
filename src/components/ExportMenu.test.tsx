import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { flush } from "solid-js";
import { clearDocumentState, resetDocumentState } from "~/state/document";
import { exportActiveDocument, exportError, resetExportState } from "~/state/export";
import { TEST_DOCUMENTS } from "~/test-documents";
import ExportMenu from "./ExportMenu";

afterEach(() => {
  clearDocumentState();
  resetExportState();
});

describe("ExportMenu", () => {
  it("lists the three formats with icons", async () => {
    resetDocumentState(TEST_DOCUMENTS);
    const user = userEvent.setup();
    render(() => <ExportMenu />);
    const trigger = screen.getByRole("button", { name: "Export" });
    expect(trigger).toHaveAttribute("title", "Export document");
    expect(trigger).toBeEnabled();
    await user.click(trigger);
    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Markdown (.md)",
      "Word document (.docx)",
      "PDF…",
    ]);
    expect(items.map((item) => item.querySelector("svg")?.getAttribute("data-icon"))).toEqual([
      "file",
      "file-text",
      "printer",
    ]);
  });

  it("runs the chosen export and closes", async () => {
    resetDocumentState(TEST_DOCUMENTS);
    const user = userEvent.setup();
    const onExport = vi.fn();
    render(() => <ExportMenu onExport={onExport} />);
    await user.click(screen.getByRole("button", { name: "Export" }));
    await user.click(await screen.findByRole("menuitem", { name: "Word document (.docx)" }));
    expect(onExport).toHaveBeenCalledWith("docx");
    expect(screen.queryByRole("menu")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Export" }));
    await user.click(await screen.findByRole("menuitem", { name: "PDF…" }));
    expect(onExport).toHaveBeenLastCalledWith("pdf");
  });

  it("starts the renderer when the pointer or focus reaches the menu", async () => {
    resetDocumentState(TEST_DOCUMENTS);
    const user = userEvent.setup();
    const onPrepare = vi.fn();
    render(() => <ExportMenu onExport={vi.fn()} onPrepare={onPrepare} />);
    await user.hover(screen.getByRole("button", { name: "Export" }));
    expect(onPrepare).toHaveBeenCalled();
    onPrepare.mockClear();
    await user.unhover(screen.getByRole("button", { name: "Export" }));
    await user.tab();
    expect(screen.getByRole("button", { name: "Export" })).toHaveFocus();
    expect(onPrepare).toHaveBeenCalled();
  });

  it("ignores a renderer that cannot start and does nothing for an empty library", async () => {
    const user = userEvent.setup();
    const onPrepare = vi.fn(() => {
      throw new Error("Worker is not defined");
    });
    render(() => <ExportMenu onPrepare={onPrepare} />);
    await user.hover(screen.getByRole("button", { name: "Export" }));
    expect(onPrepare).not.toHaveBeenCalled();
    await user.unhover(screen.getByRole("button", { name: "Export" }));
    flush(() => resetDocumentState(TEST_DOCUMENTS));
    await user.hover(screen.getByRole("button", { name: "Export" }));
    expect(onPrepare).toHaveBeenCalledTimes(1);
  });

  it("is disabled when the library is empty", () => {
    render(() => <ExportMenu />);
    expect(screen.getByRole("button", { name: "Export" })).toBeDisabled();
  });

  it("shows the export failure as a dismissible alert under the trigger", async () => {
    flush(() => resetDocumentState(TEST_DOCUMENTS));
    const user = userEvent.setup();
    render(() => <ExportMenu />);
    await exportActiveDocument("pdf", {
      render: async () => "",
      download: vi.fn(),
      print: async () => {
        throw new Error("Couldn’t open the print preview.");
      },
    });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn’t open the print preview.");
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(exportError()).toBeNull();
  });
});
