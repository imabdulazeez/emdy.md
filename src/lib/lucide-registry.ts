import groups from "virtual:lucide-groups";

export type LucideNode = readonly (readonly [
  tag: string,
  attrs: Record<string, string | number>,
])[];

export type LucideGroup = ReadonlyMap<string, LucideNode>;

export const LUCIDE_GROUPS: readonly string[] = Object.keys(groups).sort();

export async function loadLucideGroup(key: string): Promise<LucideGroup> {
  const load = groups[key];
  if (!load) return new Map();
  const module = await load();
  return new Map(Object.entries(module.default));
}
