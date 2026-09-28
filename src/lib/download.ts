export const REVOKE_DELAY_MS = 1_000;

export interface DownloadHost {
  document: Pick<Document, "createElement" | "body">;
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
  setTimeout: (callback: () => void, delay: number) => unknown;
}

const browserHost = (): DownloadHost => ({
  document,
  createObjectURL: (blob) => URL.createObjectURL(blob),
  revokeObjectURL: (url) => URL.revokeObjectURL(url),
  setTimeout: (callback, delay) => setTimeout(callback, delay),
});

export function downloadBlob(name: string, blob: Blob, host: DownloadHost = browserHost()): void {
  const url = host.createObjectURL(blob);
  const anchor = host.document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.rel = "noopener";
  anchor.hidden = true;
  host.document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    host.setTimeout(() => host.revokeObjectURL(url), REVOKE_DELAY_MS);
  }
}

export function downloadText(
  name: string,
  text: string,
  type: string,
  host: DownloadHost = browserHost(),
): void {
  downloadBlob(name, new Blob([text], { type }), host);
}
