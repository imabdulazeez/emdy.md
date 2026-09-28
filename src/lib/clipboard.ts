/** How long a copy control shows its "Copied" confirmation before settling back. */
export const COPY_FEEDBACK_MS = 1200;

/**
 * Writes text to the system clipboard. Resolves to `false` when the Clipboard
 * API is unavailable (insecure context, older browser) or the write is denied,
 * so callers can skip their "copied" feedback instead of lying about it.
 */
export async function copyText(text: string): Promise<boolean> {
  const clipboard = globalThis.navigator?.clipboard;
  if (typeof clipboard?.writeText !== "function") return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
