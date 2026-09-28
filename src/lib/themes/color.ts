const HEX = /^#[0-9a-f]{6}$/;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX.test(value);
}

export function normalizeHex(input: string): string | null {
  const raw = input.trim().toLowerCase().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/.test(raw)) {
    return `#${raw
      .split("")
      .map((digit) => digit + digit)
      .join("")}`;
  }
  return /^[0-9a-f]{6}$/.test(raw) ? `#${raw}` : null;
}

function channels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function toHex(values: readonly number[]): string {
  return `#${values
    .map((value) =>
      Math.round(Math.min(255, Math.max(0, value)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

export function mix(from: string, to: string, amount: number): string {
  const a = channels(from);
  const b = channels(to);
  return toHex(a.map((value, index) => value + (b[index] - value) * amount));
}

export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

export function mostReadable(background: string, candidates: readonly string[]): string {
  return candidates.reduce((best, candidate) =>
    contrast(background, candidate) > contrast(background, best) ? candidate : best,
  );
}
