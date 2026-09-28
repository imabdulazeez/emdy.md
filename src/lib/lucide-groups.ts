export const LUCIDE_GROUPS_ID = "virtual:lucide-groups";
const GROUP_PREFIX = "virtual:lucide-group/lucide-";

export function lucideGroupKey(name: string): string {
  return name.charAt(0);
}

export function groupLucideFiles(files: readonly string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  const names = files
    .filter((file) => file.endsWith(".mjs"))
    .map((file) => file.slice(0, -".mjs".length))
    .sort();
  for (const name of names) {
    const key = lucideGroupKey(name);
    if (!/^[a-z0-9]$/.test(key)) continue;
    const group = groups.get(key) ?? [];
    group.push(name);
    groups.set(key, group);
  }
  return groups;
}

export function lucideGroupsPlugin(base: string, files: readonly string[]) {
  const groups = groupLucideFiles(files);
  const index = () =>
    `export default {\n${Array.from(
      groups.keys(),
      (key) => `  ${JSON.stringify(key)}: () => import(${JSON.stringify(GROUP_PREFIX + key)}),`,
    ).join("\n")}\n};\n`;
  const group = (names: readonly string[]) =>
    [
      ...names.map((name, i) => `import i${i} from ${JSON.stringify(`${base}/${name}.mjs`)};`),
      `export default {\n${names.map((name, i) => `  ${JSON.stringify(name)}: i${i},`).join("\n")}\n};`,
      "",
    ].join("\n");
  return {
    name: "emdy-lucide-groups",
    resolveId(source: string) {
      if (source === LUCIDE_GROUPS_ID || source.startsWith(GROUP_PREFIX)) return `\0${source}`;
      return null;
    },
    load(id: string) {
      if (id === `\0${LUCIDE_GROUPS_ID}`) return index();
      if (!id.startsWith(`\0${GROUP_PREFIX}`)) return null;
      const names = groups.get(id.slice(GROUP_PREFIX.length + 1));
      return names ? group(names) : null;
    },
  };
}
