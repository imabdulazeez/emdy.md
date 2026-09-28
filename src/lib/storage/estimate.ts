export interface StorageUsage {
  usage: number;
  quota: number;
}

const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit++;
  }
  const digits = unit === 0 ? 0 : value < 10 ? 1 : 0;
  return `${value.toFixed(digits)} ${UNITS[unit]}`;
}

export async function storageUsage(
  manager: Pick<StorageManager, "estimate"> | undefined = globalThis.navigator?.storage,
): Promise<StorageUsage | null> {
  if (!manager || typeof manager.estimate !== "function") return null;
  try {
    const { usage, quota } = await manager.estimate();
    if (typeof usage !== "number" || typeof quota !== "number") return null;
    return { usage, quota };
  } catch {
    return null;
  }
}
