import { isHexColor, mix, mostReadable } from "./color";

export const THEME_ROLES = [
  "canvas",
  "surface",
  "surface-raised",
  "border",
  "border-strong",
  "text",
  "text-muted",
  "text-faint",
  "accent",
  "accent-soft",
  "accent-fg",
  "danger",
  "danger-soft",
  "selection",
  "syntax-heading",
  "syntax-marker",
  "syntax-link",
  "syntax-url",
  "syntax-code",
  "syntax-code-bg",
  "syntax-quote",
  "syntax-keyword",
  "syntax-string",
  "syntax-number",
  "syntax-comment",
  "syntax-function",
  "syntax-type",
] as const;

export const THEME_APPEARANCES = ["light", "dark"] as const;

export type ThemeRole = (typeof THEME_ROLES)[number];
export type ThemeAppearance = (typeof THEME_APPEARANCES)[number];
export type ThemeColors = Readonly<Record<ThemeRole, string>>;

export interface ThemeDefinition {
  readonly id: string;
  readonly name: string;
  readonly light: ThemeColors;
  readonly dark: ThemeColors;
}

export const GUIDED_ROLES = [
  "canvas",
  "surface",
  "text",
  "accent",
] as const satisfies readonly ThemeRole[];
export type GuidedRole = (typeof GUIDED_ROLES)[number];

export const ROLE_LABELS: Readonly<Record<ThemeRole, string>> = {
  canvas: "Canvas",
  surface: "Sheet",
  "surface-raised": "Raised surface",
  border: "Border",
  "border-strong": "Strong border",
  text: "Ink",
  "text-muted": "Muted text",
  "text-faint": "Faint text",
  accent: "Accent",
  "accent-soft": "Accent tint",
  "accent-fg": "Text on accent",
  danger: "Danger",
  "danger-soft": "Danger tint",
  selection: "Selection",
  "syntax-heading": "Headings",
  "syntax-marker": "Markers",
  "syntax-link": "Links",
  "syntax-url": "URLs",
  "syntax-code": "Inline code",
  "syntax-code-bg": "Code background",
  "syntax-quote": "Quotes",
  "syntax-keyword": "Keywords",
  "syntax-string": "Strings",
  "syntax-number": "Numbers",
  "syntax-comment": "Comments",
  "syntax-function": "Functions",
  "syntax-type": "Types",
};

export const ROLE_GROUPS: readonly { label: string; roles: readonly ThemeRole[] }[] = [
  {
    label: "Surfaces",
    roles: ["canvas", "surface", "surface-raised", "border", "border-strong", "selection"],
  },
  { label: "Text", roles: ["text", "text-muted", "text-faint"] },
  { label: "Accent", roles: ["accent", "accent-soft", "accent-fg", "danger", "danger-soft"] },
  {
    label: "Markdown",
    roles: [
      "syntax-heading",
      "syntax-marker",
      "syntax-link",
      "syntax-url",
      "syntax-code",
      "syntax-code-bg",
      "syntax-quote",
    ],
  },
  {
    label: "Code",
    roles: [
      "syntax-keyword",
      "syntax-string",
      "syntax-number",
      "syntax-comment",
      "syntax-function",
      "syntax-type",
    ],
  },
];

export function isThemeColors(value: unknown): value is ThemeColors {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === THEME_ROLES.length &&
    THEME_ROLES.every((role) => isHexColor(record[role]))
  );
}

export type ThemeBase = Readonly<Record<GuidedRole, string>>;

const MIX: Record<ThemeAppearance, Record<string, number>> = {
  light: {
    raised: 0.05,
    border: 0.13,
    strong: 0.28,
    muted: 0.37,
    faint: 0.56,
    accentSoft: 0.12,
    selection: 0.2,
    dangerSoft: 0.11,
    marker: 0.62,
    url: 0.5,
    code: 0.2,
    quote: 0.35,
    comment: 0.5,
  },
  dark: {
    raised: 0.055,
    border: 0.08,
    strong: 0.2,
    muted: 0.37,
    faint: 0.62,
    accentSoft: 0.2,
    selection: 0.32,
    dangerSoft: 0.18,
    marker: 0.65,
    url: 0.5,
    code: 0.1,
    quote: 0.3,
    comment: 0.55,
  },
};

export function derivePalette(
  base: ThemeBase,
  appearance: ThemeAppearance,
  seed: ThemeColors,
): ThemeColors {
  const amount = MIX[appearance];
  const { canvas, surface, text, accent } = base;
  const raised = mix(surface, text, amount.raised);
  return {
    ...seed,
    canvas,
    surface,
    "surface-raised": raised,
    border: mix(surface, text, amount.border),
    "border-strong": mix(surface, text, amount.strong),
    text,
    "text-muted": mix(text, surface, amount.muted),
    "text-faint": mix(text, surface, amount.faint),
    accent,
    "accent-soft": mix(surface, accent, amount.accentSoft),
    "accent-fg": mostReadable(accent, [surface, text]),
    "danger-soft": mix(surface, seed.danger, amount.dangerSoft),
    selection: mix(surface, accent, amount.selection),
    "syntax-heading": text,
    "syntax-marker": mix(text, surface, amount.marker),
    "syntax-link": accent,
    "syntax-url": mix(text, surface, amount.url),
    "syntax-code": mix(text, surface, amount.code),
    "syntax-code-bg": raised,
    "syntax-quote": mix(text, surface, amount.quote),
    "syntax-comment": mix(text, surface, amount.comment),
  };
}

export function themeBase(colors: ThemeColors): ThemeBase {
  return {
    canvas: colors.canvas,
    surface: colors.surface,
    text: colors.text,
    accent: colors.accent,
  };
}

const PAPER_LIGHT: ThemeColors = {
  canvas: "#e9e8e3",
  surface: "#ffffff",
  "surface-raised": "#f2f2ef",
  border: "#dddcd6",
  "border-strong": "#bab9b1",
  text: "#1b1b19",
  "text-muted": "#6b6b66",
  "text-faint": "#9b9b94",
  accent: "#2d4bd1",
  "accent-soft": "#e6eafc",
  "accent-fg": "#ffffff",
  danger: "#b8322f",
  "danger-soft": "#fbe7e5",
  selection: "#d8dffa",
  "syntax-heading": "#1b1b19",
  "syntax-marker": "#b0b0a8",
  "syntax-link": "#2d4bd1",
  "syntax-url": "#8f8f88",
  "syntax-code": "#4f4f4a",
  "syntax-code-bg": "#f2f2ef",
  "syntax-quote": "#626260",
  "syntax-keyword": "#8a3fa8",
  "syntax-string": "#2e7d5b",
  "syntax-number": "#b3501c",
  "syntax-comment": "#9a9a92",
  "syntax-function": "#2b63a8",
  "syntax-type": "#8a6a20",
};

const PAPER_DARK: ThemeColors = {
  canvas: "#121213",
  surface: "#1b1b1d",
  "surface-raised": "#262628",
  border: "#2c2c2f",
  "border-strong": "#45454a",
  text: "#ebebe8",
  "text-muted": "#9a9a97",
  "text-faint": "#66666a",
  accent: "#8fa3ff",
  "accent-soft": "#232a4d",
  "accent-fg": "#0f1330",
  danger: "#f08a86",
  "danger-soft": "#3d2222",
  selection: "#2b3566",
  "syntax-heading": "#f3f3ef",
  "syntax-marker": "#5a5a5f",
  "syntax-link": "#8fa3ff",
  "syntax-url": "#7a7a80",
  "syntax-code": "#d8d8d2",
  "syntax-code-bg": "#262628",
  "syntax-quote": "#a6a6a2",
  "syntax-keyword": "#c79ad9",
  "syntax-string": "#8fcaa6",
  "syntax-number": "#e6a06f",
  "syntax-comment": "#6b6b70",
  "syntax-function": "#86b6df",
  "syntax-type": "#d1b46a",
};

export const DEFAULT_THEME: ThemeDefinition = {
  id: "paper",
  name: "Paper",
  light: PAPER_LIGHT,
  dark: PAPER_DARK,
};

interface ThemeSpec {
  id: string;
  name: string;
  light: ThemeBase & { danger?: string; syntax?: Partial<ThemeColors> };
  dark: ThemeBase & { danger?: string; syntax?: Partial<ThemeColors> };
}

function buildTheme(spec: ThemeSpec): ThemeDefinition {
  const build = (appearance: ThemeAppearance, fallback: ThemeColors) => {
    const { danger, syntax, ...base } = spec[appearance];
    const seed = { ...fallback, ...syntax, danger: danger ?? fallback.danger };
    return derivePalette(base, appearance, seed);
  };
  return {
    id: spec.id,
    name: spec.name,
    light: build("light", PAPER_LIGHT),
    dark: build("dark", PAPER_DARK),
  };
}

export const BUILT_IN_THEMES: readonly ThemeDefinition[] = [
  DEFAULT_THEME,
  buildTheme({
    id: "sepia",
    name: "Sepia",
    light: {
      canvas: "#e6dfd1",
      surface: "#fbf7ef",
      text: "#2b2520",
      accent: "#9c4a1f",
      danger: "#b0302a",
      syntax: { "syntax-keyword": "#8a3f6a", "syntax-function": "#35658a" },
    },
    dark: {
      canvas: "#181512",
      surface: "#221e1a",
      text: "#e9e1d3",
      accent: "#e0975f",
      danger: "#ef8a7f",
      syntax: { "syntax-keyword": "#d49ab8", "syntax-function": "#8fb6d4" },
    },
  }),
  buildTheme({
    id: "sage",
    name: "Sage",
    light: { canvas: "#dde3d9", surface: "#fafcf7", text: "#1d261f", accent: "#3a7338" },
    dark: { canvas: "#111512", surface: "#191f1a", text: "#e2e9e1", accent: "#8ccf86" },
  }),
  buildTheme({
    id: "tide",
    name: "Tide",
    light: { canvas: "#dae3e7", surface: "#fafcfd", text: "#15212a", accent: "#0b6f7c" },
    dark: { canvas: "#0e1519", surface: "#152026", text: "#dfe9ee", accent: "#5fc6d3" },
  }),
  buildTheme({
    id: "iris",
    name: "Iris",
    light: { canvas: "#e3e0eb", surface: "#fcfbff", text: "#1f1b2b", accent: "#6a3fc4" },
    dark: { canvas: "#13111a", surface: "#1c1925", text: "#e9e6f2", accent: "#b39bff" },
  }),
  buildTheme({
    id: "rose",
    name: "Rose",
    light: {
      canvas: "#ebdfe1",
      surface: "#fffbfb",
      text: "#2a1c20",
      accent: "#b0335c",
      danger: "#a8401f",
    },
    dark: {
      canvas: "#191113",
      surface: "#23191c",
      text: "#f0e4e7",
      accent: "#f08aab",
      danger: "#f0a07a",
    },
  }),
];
