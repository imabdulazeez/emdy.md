import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { definePreference, resetPreferences, type Preference } from "~/state/preferences";
import { palette, resetThemeState, theme } from "~/state/theme";
import PreferenceField from "./PreferenceField";

const isFlag = (value: unknown): value is boolean => typeof value === "boolean";

const flag = definePreference<boolean>({
  name: "field-test-flag",
  label: "Spellcheck",
  fallback: false,
  parse: isFlag,
  control: { kind: "toggle" },
});

afterEach(() => {
  resetThemeState();
  resetPreferences();
});

describe("PreferenceField", () => {
  it("renders a choice as a labelled radio group and sets the preference", async () => {
    const user = userEvent.setup();
    render(() => <PreferenceField preference={theme as Preference<unknown>} />);
    const group = screen.getByRole("radiogroup", { name: "Appearance" });
    expect(group).toHaveClass("segment-track");
    expect(screen.getByRole("radio", { name: "System" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "false");
    await user.click(screen.getByRole("radio", { name: "Dark" }));
    expect(theme.value()).toBe("dark");
    expect(screen.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "System" })).toHaveAttribute("aria-checked", "false");
  });

  it("renders a toggle as a switch and flips the preference", async () => {
    const user = userEvent.setup();
    render(() => <PreferenceField preference={flag as Preference<unknown>} />);
    const toggle = screen.getByRole("switch", { name: "Spellcheck" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    await user.click(toggle);
    expect(flag.value()).toBe(true);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    await user.click(toggle);
    expect(flag.value()).toBe(false);
  });

  it("renders the theme library for the palette preference", async () => {
    const user = userEvent.setup();
    render(() => <PreferenceField preference={palette as Preference<unknown>} />);
    const group = screen.getByRole("radiogroup", { name: "Theme" });
    expect(group.closest("[data-preference]")).toHaveAttribute("data-preference", "palette");
    await user.click(screen.getByRole("radio", { name: "Iris" }));
    expect(palette.value()).toBe("iris");
  });
});
