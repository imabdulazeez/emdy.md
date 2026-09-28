import { afterEach, describe, expect, it } from "vite-plus/test";
import { flush } from "solid-js";
import { BUILT_IN_THEMES, DEFAULT_THEME, derivePalette, themeBase } from "~/lib/themes/palettes";
import {
  customThemes,
  isCustomThemeList,
  peekCustomThemes,
  saveCustomTheme,
} from "./custom-themes";
import { palette, resetThemeState, selectTheme, setSystemPrefersDark } from "./theme";
import {
  beginThemeDraft,
  commitThemeDraft,
  discardThemeDraft,
  displayedAppearance,
  displayedColors,
  isGuidedRole,
  peekThemeDraft,
  resetThemeDraft,
  setDraftAdvanced,
  setDraftAppearance,
  setDraftColor,
  setDraftName,
  themeDraft,
} from "./theme-draft";

const sage = BUILT_IN_THEMES.find((theme) => theme.id === "sage")!;
const derived = {
  light: derivePalette(themeBase(sage.light), "light", sage.light),
  dark: derivePalette(themeBase(sage.dark), "dark", sage.dark),
};

afterEach(() => {
  resetThemeDraft();
  resetThemeState();
});

describe("theme draft", () => {
  it("shows the active theme when no draft is open", () => {
    expect(themeDraft()).toBeNull();
    expect(displayedColors()).toBe(DEFAULT_THEME.light);
    expect(displayedAppearance()).toBe("light");
    flush(() => {
      selectTheme("sage");
      setSystemPrefersDark(true);
    });
    expect(displayedAppearance()).toBe("dark");
    expect(displayedColors()).toBe(sage.dark);
  });

  it("starts from a source theme in the current appearance", () => {
    flush(() => beginThemeDraft({ source: sage, name: "Sage copy" }));
    expect(themeDraft()).toEqual({
      editingId: null,
      name: "Sage copy",
      light: sage.light,
      dark: sage.dark,
      appearance: "light",
      advanced: false,
    });
    expect(displayedColors()).toBe(sage.light);
  });

  it("previews the palette being edited, including its appearance", () => {
    flush(() => beginThemeDraft({ source: sage }));
    flush(() => setDraftAppearance("dark"));
    expect(displayedAppearance()).toBe("dark");
    expect(displayedColors()).toBe(sage.dark);
  });

  it("re-derives the palette from a guided colour", () => {
    flush(() => beginThemeDraft({ source: sage }));
    expect(setDraftColor("accent", "#C36")).toBe(true);
    flush();
    const colors = themeDraft()!.light;
    expect(themeBase(colors).accent).toBe("#cc3366");
    expect(colors["syntax-link"]).toBe("#cc3366");
    expect(colors["accent-soft"]).not.toBe(sage.light["accent-soft"]);
    expect(themeDraft()!.dark).toBe(sage.dark);
  });

  it("changes only one role in advanced mode", () => {
    flush(() => beginThemeDraft({ source: sage }));
    flush(() => setDraftAdvanced(true));
    flush(() => setDraftColor("accent", "#cc3366"));
    const colors = themeDraft()!.light;
    expect(colors.accent).toBe("#cc3366");
    expect(colors["syntax-link"]).toBe(sage.light["syntax-link"]);
    flush(() => setDraftColor("syntax-keyword", "#123456"));
    expect(themeDraft()!.light["syntax-keyword"]).toBe("#123456");
  });

  it("rejects invalid colours", () => {
    flush(() => beginThemeDraft({ source: sage }));
    expect(setDraftColor("canvas", "teal")).toBe(false);
    flush();
    expect(themeDraft()!.light).toBe(sage.light);
  });

  it("knows which roles are guided", () => {
    expect(isGuidedRole("accent")).toBe(true);
    expect(isGuidedRole("border")).toBe(false);
  });

  it("does not save without a name", () => {
    flush(() => beginThemeDraft({ source: sage }));
    flush(() => setDraftName("   "));
    expect(commitThemeDraft()).toBeNull();
    expect(customThemes()).toEqual([]);
    expect(peekThemeDraft()).not.toBeNull();
  });

  it("caps the name length", () => {
    flush(() => beginThemeDraft({ source: sage }));
    flush(() => setDraftName("x".repeat(80)));
    expect(themeDraft()!.name).toHaveLength(40);
  });

  it("saves a new theme, selects it, and closes the draft", () => {
    flush(() => beginThemeDraft({ source: sage }));
    flush(() => {
      setDraftName("  Night Ink ");
      setDraftColor("accent", "#cc3366");
    });
    let saved: ReturnType<typeof commitThemeDraft> = null;
    flush(() => {
      saved = commitThemeDraft();
    });
    expect(saved).toMatchObject({ id: "custom-night-ink", name: "Night Ink" });
    expect(customThemes()).toHaveLength(1);
    expect(customThemes()[0].light.accent).toBe("#cc3366");
    expect(palette.value()).toBe("custom-night-ink");
    expect(themeDraft()).toBeNull();
    expect(displayedColors().accent).toBe("#cc3366");
  });

  it("gives a second theme with the same name its own id", () => {
    flush(() => beginThemeDraft({ source: sage, name: "Night" }));
    flush(() => commitThemeDraft());
    flush(() => beginThemeDraft({ source: sage, name: "Night" }));
    flush(() => commitThemeDraft());
    expect(customThemes().map((theme) => theme.id)).toEqual(["custom-night", "custom-night-2"]);
  });

  it("updates an edited theme in place", () => {
    const night = { id: "custom-night", name: "Night", light: sage.light, dark: sage.dark };
    flush(() => saveCustomTheme(night));
    flush(() => beginThemeDraft({ source: night, editing: true }));
    expect(themeDraft()!.name).toBe("Night");
    expect(themeDraft()!.editingId).toBe("custom-night");
    flush(() => setDraftName("Midnight"));
    flush(() => commitThemeDraft());
    expect(customThemes()).toEqual([{ ...night, name: "Midnight" }]);
  });

  it("creates a new theme when the edited one was deleted meanwhile", () => {
    const night = { id: "custom-night", name: "Midnight", light: sage.light, dark: sage.dark };
    flush(() => beginThemeDraft({ source: night, editing: true }));
    flush(() => commitThemeDraft());
    expect(customThemes().map((theme) => theme.id)).toEqual(["custom-midnight"]);
  });

  it("caps a seeded name so the saved list stays valid", () => {
    const long = { id: "custom-long", name: "x".repeat(36), light: sage.light, dark: sage.dark };
    flush(() => saveCustomTheme(long));
    flush(() => beginThemeDraft({ source: long, name: `${long.name} copy` }));
    expect(themeDraft()!.name).toHaveLength(40);
    flush(() => commitThemeDraft());
    expect(isCustomThemeList(peekCustomThemes())).toBe(true);
    expect(customThemes()[1].name).toHaveLength(40);
  });

  it("refuses to save a theme that would not load back", () => {
    flush(() => beginThemeDraft({ source: { ...sage, light: { ...sage.light, canvas: "teal" } } }));
    flush(() => setDraftName("Broken"));
    expect(commitThemeDraft()).toBeNull();
    expect(customThemes()).toEqual([]);
    expect(palette.value()).toBe("paper");
  });

  it("opens a derived theme in guided mode", () => {
    const night = { id: "custom-night", name: "Night", ...derived };
    flush(() => beginThemeDraft({ source: night, editing: true }));
    expect(themeDraft()!.advanced).toBe(false);
  });

  it("reopens a fine-tuned theme in advanced mode and keeps its tuned roles", () => {
    const night = {
      id: "custom-night",
      name: "Night",
      light: { ...derived.light, border: "#ff0000" },
      dark: derived.dark,
    };
    flush(() => saveCustomTheme(night));
    flush(() => beginThemeDraft({ source: night, editing: true, appearance: "light" }));
    expect(themeDraft()!.advanced).toBe(true);
    flush(() => setDraftColor("accent", "#123456"));
    expect(themeDraft()!.light.accent).toBe("#123456");
    expect(themeDraft()!.light.border).toBe("#ff0000");
  });

  it("does not open a duplicate in advanced mode", () => {
    const tuned = { ...sage, light: { ...derived.light, border: "#ff0000" }, dark: derived.dark };
    flush(() => beginThemeDraft({ source: tuned, name: "Copy" }));
    expect(themeDraft()!.advanced).toBe(false);
  });

  it("discards the draft and restores the active theme", () => {
    flush(() => beginThemeDraft({ source: sage, appearance: "dark" }));
    expect(displayedAppearance()).toBe("dark");
    flush(() => discardThemeDraft());
    expect(themeDraft()).toBeNull();
    expect(displayedAppearance()).toBe("light");
    expect(displayedColors()).toBe(DEFAULT_THEME.light);
    expect(customThemes()).toEqual([]);
  });

  it("ignores edits when no draft is open", () => {
    flush(() => {
      setDraftName("x");
      setDraftColor("accent", "#000000");
      discardThemeDraft();
    });
    expect(themeDraft()).toBeNull();
    expect(commitThemeDraft()).toBeNull();
  });
});
