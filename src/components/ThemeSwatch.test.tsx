import { render, screen } from "@solidjs/testing-library";
import { describe, expect, it } from "vite-plus/test";
import { BUILT_IN_THEMES, THEME_ROLES } from "~/lib/themes/palettes";
import ThemeSwatch, { themeStyle } from "./ThemeSwatch";

const rose = BUILT_IN_THEMES.find((theme) => theme.id === "rose")!;

describe("ThemeSwatch", () => {
  it("maps every role to its custom property", () => {
    const style = themeStyle(rose.light);
    expect(Object.keys(style)).toHaveLength(THEME_ROLES.length);
    expect(style["--color-accent"]).toBe(rose.light.accent);
  });

  it("renders a decorative light and dark half scoped to the theme", () => {
    render(() => <ThemeSwatch theme={rose} />);
    const swatch = screen.getByTestId("theme-swatch");
    expect(swatch).toHaveAttribute("aria-hidden", "true");
    const light = swatch.querySelector<HTMLElement>('[data-appearance="light"]')!;
    const dark = swatch.querySelector<HTMLElement>('[data-appearance="dark"]')!;
    expect(light.style.getPropertyValue("--color-canvas")).toBe(rose.light.canvas);
    expect(dark.style.getPropertyValue("--color-canvas")).toBe(rose.dark.canvas);
    expect(dark.querySelector(".bg-accent")).not.toBeNull();
  });
});
