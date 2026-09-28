import { render, screen } from "@solidjs/testing-library";
import { flush } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { TEST_DOCUMENTS } from "~/test-documents";
import { resetDocumentState, setDocText } from "~/state/document";
import LastEdited from "./LastEdited";

const NOW = new Date(2026, 8, 28, 15, 0).getTime();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
  resetDocumentState(TEST_DOCUMENTS);
});

describe("LastEdited", () => {
  it("shows when the active document was last edited, with the full stamp on hover", () => {
    const modified = NOW - 3 * 3_600_000;
    resetDocumentState([{ ...TEST_DOCUMENTS[0], modified }]);
    render(() => <LastEdited />);
    const label = screen.getByTestId("last-edited");
    expect(label.tagName).toBe("TIME");
    expect(label).toHaveTextContent("Edited 3h ago");
    expect(label).toHaveAttribute("title", "Last edited Sep 28, 2026, 12:00 PM");
    expect(label).toHaveAttribute("datetime", new Date(modified).toISOString());
  });

  it("advances as time passes without an edit", () => {
    resetDocumentState([{ ...TEST_DOCUMENTS[0], modified: NOW - 30_000 }]);
    render(() => <LastEdited />);
    expect(screen.getByTestId("last-edited")).toHaveTextContent("Edited just now");
    vi.advanceTimersByTime(2 * 60_000);
    flush();
    expect(screen.getByTestId("last-edited")).toHaveTextContent("Edited 2m ago");
  });

  it("reads as just now after typing", () => {
    resetDocumentState([{ ...TEST_DOCUMENTS[0], modified: NOW - 5 * 3_600_000 }]);
    render(() => <LastEdited />);
    expect(screen.getByTestId("last-edited")).toHaveTextContent("Edited 5h ago");
    setDocText("# Changed");
    flush();
    expect(screen.getByTestId("last-edited")).toHaveTextContent("Edited just now");
  });

  it("renders nothing when no document is open", () => {
    resetDocumentState([]);
    render(() => <LastEdited />);
    expect(screen.queryByTestId("last-edited")).toBeNull();
  });
});
