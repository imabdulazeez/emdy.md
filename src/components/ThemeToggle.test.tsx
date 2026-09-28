import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { resetThemeState, themePreference } from "~/state/theme";
import ThemeToggle from "./ThemeToggle";

afterEach(() => resetThemeState());

describe("ThemeToggle", () => {
  it("renders light, dark, and system with system pressed by default", () => {
    render(() => <ThemeToggle />);
    expect(screen.getByRole("group", { name: "Theme" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "System theme" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Light theme" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Dark theme" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("changes the preference on click", async () => {
    const user = userEvent.setup();
    render(() => <ThemeToggle />);
    await user.click(screen.getByRole("button", { name: "Dark theme" }));
    expect(themePreference()).toBe("dark");
    expect(screen.getByRole("button", { name: "Dark theme" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Light theme" }));
    expect(themePreference()).toBe("light");
  });
});
