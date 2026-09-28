import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { flush } from "solid-js";
import { resetStatsState, updateStatsFromText } from "~/state/stats";
import DocumentStatus from "./DocumentStatus";

afterEach(() => resetStatsState());

const labelTrack = (testId: string) =>
  screen.getByTestId(testId).querySelector<HTMLElement>("[data-label]");

describe("DocumentStatus", () => {
  it("shows the word count and the character count at opposite ends", () => {
    flush(() => updateStatsFromText("one two three four five"));
    render(() => <DocumentStatus />);
    const words = screen.getByTestId("status-words");
    const chars = screen.getByTestId("status-chars");
    expect(screen.getByTestId("status-words-value")).toHaveTextContent("5");
    expect(screen.getByTestId("status-chars-value")).toHaveTextContent("23");
    expect(words.querySelector("[data-icon='type']")).not.toBeNull();
    expect(chars.querySelector("[data-icon='hash']")).not.toBeNull();
    expect(chars).toHaveClass("ml-auto");
    expect(words.compareDocumentPosition(chars) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("drops the reading time and the cursor position", () => {
    flush(() => updateStatsFromText("one two three"));
    render(() => <DocumentStatus />);
    expect(screen.queryByTestId("status-cursor")).toBeNull();
    expect(screen.queryByText(/min read/)).toBeNull();
    expect(screen.queryByText(/Ln \d/)).toBeNull();
  });

  it("keeps the labels in the accessibility tree while collapsed", () => {
    render(() => <DocumentStatus />);
    expect(screen.getByText("Word count")).toBeInTheDocument();
    expect(screen.getByText("Character count")).toBeInTheDocument();
    expect(screen.getByTestId("status-words")).toHaveAttribute("data-expanded", "false");
    expect(labelTrack("status-words")).toHaveStyle({ gridTemplateColumns: "0fr" });
    expect(labelTrack("status-chars")).toHaveStyle({ gridTemplateColumns: "0fr" });
  });

  it("unfolds the labels instead of swapping them in", () => {
    render(() => <DocumentStatus />);
    for (const id of ["status-words", "status-chars"]) {
      expect(labelTrack(id)?.getAttribute("style")).toMatch(/grid-template-columns 220ms ease-out/);
      expect(screen.getByTestId(id).getAttribute("style")).toMatch(
        /grid-template-columns 220ms ease-out/,
      );
    }
  });

  it("unfolds the word count left to right on hover and collapses the character count", async () => {
    const user = userEvent.setup();
    flush(() => updateStatsFromText("one two three"));
    render(() => <DocumentStatus />);
    await user.hover(screen.getByTestId("status-words"));
    expect(screen.getByTestId("status-words")).toHaveAttribute("data-expanded", "true");
    expect(labelTrack("status-words")).toHaveStyle({ gridTemplateColumns: "1fr" });
    expect(labelTrack("status-words")?.firstElementChild).not.toHaveClass("text-right");
    expect(screen.getByTestId("status-chars")).toHaveAttribute("data-visible", "false");
    expect(screen.getByTestId("status-chars")).toHaveStyle({
      gridTemplateColumns: "0fr",
      opacity: "0",
    });
    await user.unhover(screen.getByTestId("status-words"));
    expect(screen.getByTestId("status-words")).toHaveAttribute("data-expanded", "false");
    expect(labelTrack("status-words")).toHaveStyle({ gridTemplateColumns: "0fr" });
    expect(screen.getByTestId("status-chars")).toHaveAttribute("data-visible", "true");
  });

  it("unfolds the character count right to left on hover and collapses the word count", async () => {
    const user = userEvent.setup();
    flush(() => updateStatsFromText("one two three"));
    render(() => <DocumentStatus />);
    await user.hover(screen.getByTestId("status-chars"));
    expect(screen.getByTestId("status-chars")).toHaveAttribute("data-expanded", "true");
    expect(labelTrack("status-chars")).toHaveStyle({ gridTemplateColumns: "1fr" });
    expect(labelTrack("status-chars")?.firstElementChild).toHaveClass("text-right");
    expect(screen.getByTestId("status-words")).toHaveAttribute("data-visible", "false");
    expect(screen.getByTestId("status-words")).toHaveStyle({
      gridTemplateColumns: "0fr",
      opacity: "0",
    });
    await user.unhover(screen.getByTestId("status-chars"));
    expect(screen.getByTestId("status-words")).toHaveAttribute("data-visible", "true");
    expect(labelTrack("status-chars")).toHaveStyle({ gridTemplateColumns: "0fr" });
  });

  it("updates reactively", () => {
    render(() => <DocumentStatus />);
    expect(screen.getByTestId("status-words-value")).toHaveTextContent("0");
    flush(() => updateStatsFromText(Array.from({ length: 1200 }, () => "w").join(" ")));
    expect(screen.getByTestId("status-words-value")).toHaveTextContent("1,200");
    expect(screen.getByTestId("status-chars-value")).toHaveTextContent("2,399");
  });
});
