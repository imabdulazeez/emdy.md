import { cleanup, render, screen, within } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { flush } from "solid-js";
import { BUILT_IN_THEMES, DEFAULT_THEME } from "~/lib/themes/palettes";
import { customThemes, saveCustomTheme } from "~/state/custom-themes";
import { palette, resetThemeState, selectTheme } from "~/state/theme";
import { resetThemeDraft, themeDraft } from "~/state/theme-draft";
import ThemeLibrary from "./ThemeLibrary";

const sage = BUILT_IN_THEMES.find((theme) => theme.id === "sage")!;
const night = {
  id: "custom-night",
  name: "Night",
  light: { ...DEFAULT_THEME.light, accent: "#cc3366" },
  dark: DEFAULT_THEME.dark,
};

afterEach(() => {
  cleanup();
  resetThemeDraft();
  resetThemeState();
});

const mount = () => render(() => <ThemeLibrary label="Theme" />);
const gallery = () => screen.getByRole("radiogroup", { name: "Theme" });

describe("ThemeLibrary", () => {
  it("lists the six built-in themes with Paper selected", () => {
    mount();
    const radios = within(gallery()).getAllByRole("radio");
    expect(radios.map((radio) => radio.getAttribute("aria-label"))).toEqual([
      "Paper",
      "Sepia",
      "Sage",
      "Tide",
      "Iris",
      "Rose",
    ]);
    expect(screen.getByRole("radio", { name: "Paper" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("button", { name: "Duplicate Sage" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit Sage" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete Sage" })).toBeNull();
  });

  it("selects a theme when its card is clicked", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("radio", { name: "Tide" }));
    expect(palette.value()).toBe("tide");
    expect(screen.getByRole("radio", { name: "Tide" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Paper" })).toHaveAttribute("aria-checked", "false");
  });

  it("creates a theme from the active one and selects it", async () => {
    const user = userEvent.setup();
    flush(() => selectTheme("sage"));
    mount();
    await user.click(screen.getByRole("button", { name: "Create theme" }));
    const editor = screen.getByRole("form", { name: "New theme" });
    expect(themeDraft()?.light).toBe(sage.light);
    expect(screen.queryByRole("radiogroup", { name: "Theme" })).toBeNull();
    const name = within(editor).getByRole("textbox", { name: "Name" });
    expect(name).toHaveFocus();
    expect(within(editor).getByRole("button", { name: "Save theme" })).toBeDisabled();
    await user.type(name, "Night Ink");
    const accent = within(editor).getByRole("textbox", { name: "Accent hex value" });
    await user.clear(accent);
    await user.type(accent, "#cc3366{Enter}");
    await user.click(within(editor).getByRole("button", { name: "Save theme" }));
    expect(customThemes()).toHaveLength(1);
    expect(customThemes()[0]).toMatchObject({ id: "custom-night-ink", name: "Night Ink" });
    expect(customThemes()[0].light.accent).toBe("#cc3366");
    const card = await screen.findByRole("radio", { name: "Night Ink" });
    expect(card).toHaveAttribute("aria-checked", "true");
    await Promise.resolve();
    expect(card).toHaveFocus();
  });

  it("duplicates a built-in theme with a suggested name", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Duplicate Sage" }));
    expect(screen.getByRole("textbox", { name: "Name" })).toHaveValue("Sage copy");
    await user.keyboard("{Enter}");
    expect(customThemes()[0]).toMatchObject({ name: "Sage copy", light: sage.light });
    expect(palette.value()).toBe("custom-sage-copy");
  });

  it("cancels a draft without saving", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("button", { name: "Create theme" }));
    await user.type(screen.getByRole("textbox", { name: "Name" }), "Throwaway");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(themeDraft()).toBeNull();
    expect(customThemes()).toEqual([]);
    expect(gallery()).toBeInTheDocument();
    await Promise.resolve();
    expect(screen.getByRole("button", { name: "Create theme" })).toHaveFocus();
  });

  it("edits a custom theme in place", async () => {
    const user = userEvent.setup();
    flush(() => saveCustomTheme(night));
    mount();
    await user.click(screen.getByRole("button", { name: "Edit Night" }));
    const editor = screen.getByRole("form", { name: "Edit theme" });
    const name = within(editor).getByRole("textbox", { name: "Name" });
    expect(name).toHaveValue("Night");
    await user.clear(name);
    await user.type(name, "Midnight{Enter}");
    expect(customThemes()).toEqual([{ ...night, name: "Midnight" }]);
    expect(await screen.findByRole("radio", { name: "Midnight" })).toBeInTheDocument();
  });

  it("asks before deleting a custom theme", async () => {
    const user = userEvent.setup();
    flush(() => {
      saveCustomTheme(night);
      selectTheme(night.id);
    });
    mount();
    await user.click(screen.getByRole("button", { name: "Delete Night" }));
    const confirm = screen.getByRole("group", { name: "Delete Night?" });
    await Promise.resolve();
    expect(within(confirm).getByRole("button", { name: "Delete" })).toHaveFocus();
    await user.click(within(confirm).getByRole("button", { name: "Keep" }));
    expect(customThemes()).toHaveLength(1);
    await Promise.resolve();
    expect(screen.getByRole("button", { name: "Delete Night" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Delete Night" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(customThemes()).toEqual([]);
    expect(palette.value()).toBe("paper");
    expect(screen.queryByRole("radio", { name: "Night" })).toBeNull();
    expect(screen.getByRole("radio", { name: "Paper" })).toHaveAttribute("aria-checked", "true");
  });

  it("discards an open draft when it unmounts", async () => {
    const user = userEvent.setup();
    const { unmount } = mount();
    await user.click(screen.getByRole("button", { name: "Create theme" }));
    expect(themeDraft()).not.toBeNull();
    unmount();
    flush();
    expect(themeDraft()).toBeNull();
  });
});
