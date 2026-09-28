import { cleanup, render, screen, within } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { flush, Show } from "solid-js";
import { BUILT_IN_THEMES } from "~/lib/themes/palettes";
import { resetThemeState } from "~/state/theme";
import { beginThemeDraft, resetThemeDraft, themeDraft } from "~/state/theme-draft";
import ThemeEditor from "./ThemeEditor";

const iris = BUILT_IN_THEMES.find((theme) => theme.id === "iris")!;

afterEach(() => {
  cleanup();
  resetThemeDraft();
  resetThemeState();
});

function mount(options: Parameters<typeof beginThemeDraft>[0] = { source: iris, name: "" }) {
  flush(() => beginThemeDraft(options));
  const onSave = vi.fn();
  const onCancel = vi.fn();
  render(() => (
    <Show when={themeDraft()}>
      {(draft) => <ThemeEditor draft={draft} onSave={onSave} onCancel={onCancel} />}
    </Show>
  ));
  return { onSave, onCancel };
}

describe("ThemeEditor", () => {
  it("shows the four guided colours for the current palette", () => {
    mount();
    const guided = screen.getByTestId("theme-guided-colors");
    const labels = Array.from(guided.querySelectorAll("[data-color-field]")).map((field) =>
      field.getAttribute("data-color-field"),
    );
    expect(labels).toEqual(["Canvas", "Sheet", "Ink", "Accent"]);
    expect(screen.getByRole("textbox", { name: "Accent hex value" })).toHaveValue(
      iris.light.accent,
    );
    expect(screen.getByRole("radio", { name: "Light" })).toHaveAttribute("aria-checked", "true");
  });

  it("switches between the light and dark palettes", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("radio", { name: "Dark" }));
    expect(themeDraft()?.appearance).toBe("dark");
    expect(screen.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("textbox", { name: "Canvas hex value" })).toHaveValue(iris.dark.canvas);
  });

  it("reveals every role grouped when fine-tuning", async () => {
    const user = userEvent.setup();
    mount();
    const toggle = screen.getByRole("switch", { name: "Fine-tune every colour" });
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    const all = screen.getByTestId("theme-all-colors");
    const groups = within(all).getAllByRole("group");
    expect(groups.map((group) => group.querySelector("legend")?.textContent)).toEqual([
      "Surfaces",
      "Text",
      "Accent",
      "Markdown",
      "Code",
    ]);
    const keyword = screen.getByRole("textbox", { name: "Keywords hex value" });
    await user.clear(keyword);
    await user.type(keyword, "#123456{Enter}");
    expect(themeDraft()?.light["syntax-keyword"]).toBe("#123456");
    expect(themeDraft()?.dark).toBe(iris.dark);
  });

  it("enables saving once a name is typed and submits with Enter", async () => {
    const user = userEvent.setup();
    const { onSave } = mount();
    const save = screen.getByRole("button", { name: "Save theme" });
    expect(save).toBeDisabled();
    await user.keyboard("{Enter}");
    expect(onSave).not.toHaveBeenCalled();
    await user.type(screen.getByRole("textbox", { name: "Name" }), "Violet{Enter}");
    expect(save).toBeEnabled();
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("titles an edit and cancels on request", async () => {
    const user = userEvent.setup();
    const { onCancel } = mount({ source: { ...iris, id: "custom-iris" }, editing: true });
    expect(screen.getByRole("form", { name: "Edit theme" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Iris");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
