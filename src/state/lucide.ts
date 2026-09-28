import { createSignal } from "solid-js";
import { lucideGroupKey } from "~/lib/lucide-groups";
import type { LucideGroup, LucideNode } from "~/lib/lucide-registry";

export interface LucideRegistry {
  icons: ReadonlyMap<string, LucideNode>;
  names: readonly string[];
}

const [groups, setGroups] = createSignal<ReadonlyMap<string, LucideGroup>>(new Map());
const [registry, setRegistry] = createSignal<LucideRegistry | null>(null);
const [failed, setFailed] = createSignal(false);

const loadingGroups = new Map<string, Promise<LucideGroup | null>>();
let loading: Promise<LucideRegistry | null> | null = null;

export const lucideRegistry = registry;
export const lucideFailed = failed;

export function lucideIcon(name: string): LucideNode | null | undefined {
  const group = groups().get(lucideGroupKey(name));
  return group ? group.get(name) : null;
}

function loadGroup(key: string): Promise<LucideGroup | null> {
  let pending = loadingGroups.get(key);
  if (!pending) {
    pending = import("~/lib/lucide-registry")
      .then((module) => module.loadLucideGroup(key))
      .then(
        (group) => {
          setGroups((previous) => new Map(previous).set(key, group));
          return group;
        },
        () => {
          loadingGroups.delete(key);
          setFailed(true);
          return null;
        },
      );
    loadingGroups.set(key, pending);
  }
  return pending;
}

export function loadLucideIcon(name: string): Promise<LucideNode | undefined> {
  return loadGroup(lucideGroupKey(name)).then((group) => group?.get(name));
}

export function loadLucideIcons(): Promise<LucideRegistry | null> {
  loading ??= import("~/lib/lucide-registry")
    .then((module) => Promise.all(module.LUCIDE_GROUPS.map(loadGroup)))
    .then((loaded) => {
      const icons = new Map<string, LucideNode>();
      for (const group of loaded) {
        if (!group) throw new Error("Lucide icons could not be loaded.");
        for (const [name, node] of group) icons.set(name, node);
      }
      const result = { icons, names: Array.from(icons.keys()).sort() };
      setRegistry(result);
      setFailed(false);
      return result;
    })
    .catch(() => {
      loading = null;
      setFailed(true);
      return null;
    });
  return loading;
}

export function resetLucideState(): void {
  loading = null;
  loadingGroups.clear();
  setGroups(new Map());
  setRegistry(null);
  setFailed(false);
}
