import { render, screen, within } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { deriveDocumentIdentity, type DocumentIcon } from "~/lib/document-icon";
import { resetLucideState } from "~/state/lucide";
import DocumentIconPicker from "./DocumentIconPicker";

afterEach(() => resetLucideState());

function mount(icon: DocumentIcon | null = null, title = "Reading list") {
  const onSave = vi.fn();
  const onClose = vi.fn();
  const returnFocus = document.createElement("button");
  document.body.append(returnFocus);
  render(() => (
    <DocumentIconPicker
      title={title}
      icon={icon}
      returnFocus={returnFocus}
      onSave={onSave}
      onClose={onClose}
    />
  ));
  return { onSave, onClose, returnFocus, user: userEvent.setup() };
}

const radio = (group: string, name: string) =>
  within(screen.getByRole("radiogroup", { name: group })).getByRole("radio", { name });

describe("DocumentIconPicker", () => {
  it("opens as a labelled modal on the icon tab with the search focused", async () => {
    mount();
    const dialog = screen.getByRole("dialog", { name: "Document icon" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(within(dialog).getByText("Reading list")).toBeInTheDocument();
    expect(radio("Icon type", "Icon")).toHaveAttribute("aria-checked", "true");
    await vi.waitFor(() =>
      expect(screen.getByRole("searchbox", { name: "Search icons" })).toHaveFocus(),
    );
    const automatic = deriveDocumentIdentity("Reading list").color;
    expect(
      within(screen.getByRole("radiogroup", { name: "Colour" }))
        .getAllByRole("radio")
        .filter((item) => item.getAttribute("aria-checked") === "true")
        .map((item) => item.getAttribute("aria-label")?.toLowerCase()),
    ).toEqual([automatic]);
  });

  it("searches the Lucide set and saves the chosen icon in the chosen colour", async () => {
    const { onSave, onClose, user } = mount();
    const grid = await screen.findByRole("group", { name: "Icons" }, { timeout: 5000 });
    expect(within(grid).getByRole("button", { name: "File text" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.type(screen.getByRole("searchbox", { name: "Search icons" }), "map pin");
    await user.click(
      await within(screen.getByRole("group", { name: "Icons" })).findByRole("button", {
        name: "Map pin",
      }),
    );
    await user.click(radio("Colour", "Violet"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith({ kind: "lucide", name: "map-pin", color: "violet" });
    expect(onClose).toHaveBeenCalled();
  });

  it("says when no icon matches", async () => {
    const { user } = mount();
    await screen.findByRole("group", { name: "Icons" }, { timeout: 5000 });
    await user.type(screen.getByRole("searchbox", { name: "Search icons" }), "qqqqzz");
    expect(await screen.findByText("No icons match.")).toBeInTheDocument();
  });

  it("picks an emoji from the grid or from pasted text", async () => {
    const { onSave, user } = mount();
    await user.click(radio("Icon type", "Emoji"));
    expect(screen.queryByRole("radiogroup", { name: "Colour" })).toBeNull();
    await user.click(
      within(screen.getByRole("group", { name: "Emoji" })).getByRole("button", {
        name: "Seedling",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenLastCalledWith({ kind: "emoji", emoji: "🌱" });
  });

  it("takes the first emoji of pasted text and saves on Enter", async () => {
    const { onSave, user } = mount({ kind: "emoji", emoji: "📝" });
    expect(radio("Icon type", "Emoji")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "Memo" })).toHaveAttribute("aria-pressed", "true");
    const input = screen.getByRole("textbox", { name: "Custom emoji" });
    await user.click(input);
    await user.paste("plain");
    expect(screen.getByRole("button", { name: "Memo" })).toHaveAttribute("aria-pressed", "true");
    await user.clear(input);
    await user.paste("🦊 fox");
    expect(screen.getByRole("button", { name: "Memo" })).toHaveAttribute("aria-pressed", "false");
    await user.keyboard("{Enter}");
    expect(onSave).toHaveBeenCalledWith({ kind: "emoji", emoji: "🦊" });
  });

  it("edits monogram letters, rejects invalid ones, and starts from the generated letters", async () => {
    const { onSave, user } = mount();
    await user.click(radio("Icon type", "Letters"));
    const input = screen.getByRole("textbox", { name: "Letters" });
    expect(input).toHaveValue("RL");
    await user.clear(input);
    await user.type(input, "abc");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await user.clear(input);
    await user.type(input, "q3");
    expect(input).not.toHaveAttribute("aria-invalid");
    await user.click(radio("Colour", "Amber"));
    await user.keyboard("{Enter}");
    expect(onSave).not.toHaveBeenCalled();
    await user.click(input);
    await user.keyboard("{Enter}");
    expect(onSave).toHaveBeenCalledWith({ kind: "monogram", text: "Q3", color: "amber" });
  });

  it("moves between tabs and colours with the arrow keys", async () => {
    const { user } = mount({ kind: "monogram", text: "RL", color: "red" });
    radio("Icon type", "Letters").focus();
    await user.keyboard("{ArrowRight}");
    expect(radio("Icon type", "Icon")).toHaveAttribute("aria-checked", "true");
    expect(radio("Icon type", "Icon")).toHaveFocus();
    radio("Colour", "Red").focus();
    await user.keyboard("{ArrowLeft}");
    expect(radio("Colour", "Gray")).toHaveAttribute("aria-checked", "true");
    expect(radio("Colour", "Red")).toHaveAttribute("tabindex", "-1");
  });

  it("returns to the automatic icon only when a custom one is set", async () => {
    const first = mount();
    expect(screen.getByRole("button", { name: "Use automatic" })).toBeDisabled();
    first.onSave.mockReset();
    document.body.innerHTML = "";
    const { onSave, user } = mount({ kind: "emoji", emoji: "📝" });
    await user.click(screen.getByRole("button", { name: "Use automatic" }));
    expect(onSave).toHaveBeenCalledWith(null);
  });

  it("closes without saving on Cancel, Escape, the close button, or the backdrop", async () => {
    const { onSave, onClose, returnFocus, user } = mount();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Close" }));
    await user.click(screen.getByRole("dialog").parentElement!);
    screen.getByRole("button", { name: "Save" }).focus();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(4);
    expect(onSave).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(returnFocus).toHaveFocus());
  });

  it("keeps Tab inside the dialog", async () => {
    const { user } = mount();
    const dialog = screen.getByRole("dialog");
    screen.getByRole("button", { name: "Save" }).focus();
    await user.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });
});
