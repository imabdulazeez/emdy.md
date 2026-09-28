import { fireEvent, render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { flush } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { TEST_DOCUMENTS } from "~/test-documents";
import {
  createDocument,
  resetDocumentState,
  setDocText,
  setTitle,
  title,
  titleIsAutomatic,
} from "~/state/document";
import { registerEditorApi, resetEditorApiState } from "~/state/editor-api";
import { resetUiState } from "~/state/ui";
import { addDays, formatDate, formatDateTime } from "~/lib/dates";
import DocumentTitle from "./DocumentTitle";

beforeEach(() => resetDocumentState(TEST_DOCUMENTS));

afterEach(() => {
  resetDocumentState(TEST_DOCUMENTS);
  resetEditorApiState();
  resetUiState();
});

function registerEditor() {
  const editor = document.createElement("textarea");
  editor.setAttribute("aria-label", "Editor");
  document.body.append(editor);
  const focus = vi.fn(() => editor.focus());
  flush(() =>
    registerEditorApi({
      scrollToLine: vi.fn(),
      focus,
      getText: () => "",
      flush: vi.fn(),
      runCommand: vi.fn(),
      applyEdits: vi.fn(),
    }),
  );
  return { editor, focus };
}

describe("DocumentTitle", () => {
  it("shows the title as a button", () => {
    render(() => <DocumentTitle />);
    expect(
      screen.getByRole("button", { name: /Document title: Welcome to emdy/ }),
    ).toHaveTextContent("Welcome to emdy");
  });

  it("commits a new title on Enter", async () => {
    const user = userEvent.setup();
    render(() => <DocumentTitle />);
    await user.click(screen.getByRole("button", { name: /Document title/ }));
    const input = await screen.findByRole("textbox", { name: "Document title" });
    expect(input).toHaveFocus();
    await user.clear(input);
    await user.type(input, "Meeting notes{Enter}");
    expect(title()).toBe("Meeting notes");
    expect(screen.getByRole("button", { name: /Document title/ })).toHaveTextContent(
      "Meeting notes",
    );
  });

  it("commits on blur", async () => {
    const user = userEvent.setup();
    render(() => <DocumentTitle />);
    await user.click(screen.getByRole("button", { name: /Document title/ }));
    const input = await screen.findByRole("textbox", { name: "Document title" });
    await user.clear(input);
    await user.type(input, "Blurred");
    await user.tab();
    expect(title()).toBe("Blurred");
  });

  it("cancels on Escape", async () => {
    const user = userEvent.setup();
    render(() => <DocumentTitle />);
    await user.click(screen.getByRole("button", { name: /Document title/ }));
    const input = await screen.findByRole("textbox", { name: "Document title" });
    await user.clear(input);
    await user.type(input, "Discard me{Escape}");
    expect(title()).toBe("Welcome to emdy");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("returns to the first line when the input is cleared", async () => {
    const user = userEvent.setup();
    flush(() => setTitle("Custom name"));
    render(() => <DocumentTitle />);
    await user.click(screen.getByRole("button", { name: /Document title/ }));
    const input = await screen.findByRole("textbox", { name: "Document title" });
    expect(input).toHaveAttribute("placeholder", "Blank uses the first line");
    await user.clear(input);
    await user.keyboard("{Enter}");
    expect(title()).toBe("Welcome to emdy");
  });

  it("falls back to Untitled for empty input on an empty document", async () => {
    const user = userEvent.setup();
    flush(() => createDocument("Named"));
    render(() => <DocumentTitle />);
    await user.click(screen.getByRole("button", { name: /Document title/ }));
    const input = await screen.findByRole("textbox", { name: "Document title" });
    await user.clear(input);
    await user.keyboard("{Enter}");
    expect(title()).toBe("Untitled");
  });

  it("explains when the title follows the first line", () => {
    render(() => <DocumentTitle />);
    expect(screen.getByRole("button", { name: /Document title/ })).toHaveAttribute(
      "title",
      "Title follows the first line. Click to rename",
    );
  });

  it("offers a plain rename once the title is chosen by hand", () => {
    flush(() => setTitle("Custom name"));
    render(() => <DocumentTitle />);
    expect(screen.getByRole("button", { name: /Document title/ })).toHaveAttribute(
      "title",
      "Rename document",
    );
  });

  it("follows the first line as the text changes", () => {
    render(() => <DocumentTitle />);
    flush(() => setDocText("# Trip to Lisbon\n\nPack light."));
    expect(screen.getByRole("button", { name: /Document title/ })).toHaveTextContent(
      "Trip to Lisbon",
    );
  });

  it("ignores Enter while an IME composition is active", async () => {
    const user = userEvent.setup();
    render(() => <DocumentTitle />);
    await user.click(screen.getByRole("button", { name: /Document title/ }));
    const input = await screen.findByRole("textbox", { name: "Document title" });
    await user.clear(input);
    await user.keyboard("旅行");
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(screen.getByRole("textbox", { name: "Document title" })).toHaveFocus();
    expect(title()).toBe("Welcome to emdy");
    await user.keyboard("{Enter}");
    expect(title()).toBe("旅行");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("stays a button when a document is created", () => {
    render(() => <DocumentTitle />);
    flush(() => createDocument());
    expect(screen.queryByRole("textbox", { name: "Document title" })).toBeNull();
    expect(screen.getByRole("button", { name: /Document title: Untitled/ })).toBeInTheDocument();
    expect(titleIsAutomatic()).toBe(true);
  });

  it("does not move to the editor after renaming an existing document", async () => {
    const user = userEvent.setup();
    const { focus } = registerEditor();
    render(() => <DocumentTitle />);
    await user.click(screen.getByRole("button", { name: /Document title/ }));
    await screen.findByRole("textbox", { name: "Document title" });
    await user.keyboard("Renamed{Enter}");
    expect(title()).toBe("Renamed");
    expect(focus).not.toHaveBeenCalled();
    document.querySelector('textarea[aria-label="Editor"]')?.remove();
  });
  describe("@ dates", () => {
    const today = () => formatDate(new Date());

    async function editTitle() {
      const user = userEvent.setup();
      render(() => <DocumentTitle />);
      await user.click(screen.getByRole("button", { name: /Document title/ }));
      const input = await screen.findByRole("textbox", { name: "Document title" });
      await user.clear(input);
      return { user, input: input as HTMLInputElement };
    }

    const menu = () => screen.queryByRole("listbox", { name: "Dates" });

    it("inserts today's local date with Enter and keeps the rename open", async () => {
      const { user, input } = await editTitle();
      await user.type(input, "Journal @tod");
      const option = screen.getByRole("option", { name: new RegExp(`^Today${today()}$`) });
      expect(option).toHaveAttribute("aria-selected", "true");
      expect(input).toHaveAttribute("aria-controls", menu()?.id);
      expect(input).toHaveAttribute("aria-activedescendant", option.id);
      await user.keyboard("{Enter}");
      expect(menu()).toBeNull();
      expect(input).toHaveValue(`Journal ${today()}`);
      expect(input).toHaveFocus();
      expect(input).not.toHaveAttribute("aria-activedescendant");
      await user.keyboard(" notes{Enter}");
      expect(title()).toBe(`Journal ${today()} notes`);
    });

    it("moves through dates with the arrow keys and accepts with Tab", async () => {
      const { user, input } = await editTitle();
      await user.type(input, "@");
      expect(screen.getAllByRole("option").map((option) => option.firstChild?.textContent)).toEqual(
        ["Today", "Tomorrow", "Yesterday", "Now"],
      );
      await user.keyboard("{ArrowDown}{ArrowDown}");
      expect(screen.getByRole("option", { name: /^Yesterday/ })).toHaveAttribute(
        "aria-selected",
        "true",
      );
      await user.keyboard("{ArrowUp}{ArrowUp}{ArrowUp}");
      expect(screen.getByRole("option", { name: /^Now/ })).toHaveAttribute("aria-selected", "true");
      await user.keyboard("{ArrowDown}{ArrowDown}{Tab}");
      expect(input).toHaveValue(formatDate(addDays(new Date(), 1)));
      expect(input).toHaveFocus();
    });

    it("replaces only the @ query, keeping text after the caret", async () => {
      const { user, input } = await editTitle();
      input.value = "Plan for @todreview";
      input.setSelectionRange(13, 13);
      fireEvent.input(input);
      expect(await screen.findByRole("option", { name: /^Today/ })).toBeInTheDocument();
      await user.keyboard("{Enter}");
      expect(input).toHaveValue(`Plan for ${today()}review`);
    });

    it("stays shut while text is selected", async () => {
      const { input } = await editTitle();
      input.value = "@today";
      input.setSelectionRange(1, 6);
      fireEvent.input(input);
      flush();
      expect(menu()).toBeNull();
      input.setSelectionRange(6, 6);
      fireEvent.input(input);
      expect(await screen.findByRole("listbox", { name: "Dates" })).toBeInTheDocument();
    });

    it("inserts a clicked date", async () => {
      const { user, input } = await editTitle();
      await user.type(input, "@no");
      await user.click(screen.getByRole("option", { name: /^Now/ }));
      expect(input.value).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
      expect(input.value.slice(0, 10)).toBe(formatDateTime(new Date()).slice(0, 10));
      expect(input).toHaveFocus();
      expect(menu()).toBeNull();
    });

    it("closes the menu on the first Escape and cancels the rename on the second", async () => {
      const { user, input } = await editTitle();
      await user.type(input, "@t");
      expect(menu()).not.toBeNull();
      await user.keyboard("{Escape}");
      expect(menu()).toBeNull();
      expect(input).toHaveValue("@t");
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("textbox")).toBeNull();
      expect(title()).toBe("Welcome to emdy");
    });

    it("closes when the caret moves away, reopens on typing, and closes on commit", async () => {
      const { user, input } = await editTitle();
      await user.type(input, "@tod");
      await user.keyboard("{ArrowLeft}");
      expect(menu()).toBeNull();
      await user.keyboard("{End}a");
      expect(input).toHaveValue("@toda");
      expect(menu()).not.toBeNull();
      await user.click(document.body);
      expect(title()).toBe("@toda");
      expect(menu()).toBeNull();
    });

    it("stays shut for addresses and text that is not a date", async () => {
      const { user, input } = await editTitle();
      await user.type(input, "me@tod");
      expect(menu()).toBeNull();
      await user.clear(input);
      await user.type(input, "@zzz");
      expect(menu()).toBeNull();
      await user.keyboard("{Enter}");
      expect(title()).toBe("@zzz");
    });
  });
});
