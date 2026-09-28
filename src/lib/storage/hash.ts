const OFFSET_A = 0x811c9dc5;
const OFFSET_B = 0x050c5d1f;
const PRIME = 0x01000193;

function fnv1a(text: string, offset: number): number {
  let hash = offset;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, PRIME) >>> 0;
  }
  return hash >>> 0;
}

export function hashText(text: string): string {
  const a = fnv1a(text, OFFSET_A).toString(16).padStart(8, "0");
  const b = fnv1a(text, (OFFSET_B ^ text.length) >>> 0)
    .toString(16)
    .padStart(8, "0");
  return `${a}${b}`;
}

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}
