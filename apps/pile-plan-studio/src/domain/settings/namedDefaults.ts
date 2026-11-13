export type NamedDefault<T> = { name: string; value: T };

export type NamedDefaultEdit<T> =
  | { kind: "save" | "update"; name: string; value: T }
  | { kind: "rename"; name: string; nextName: string }
  | { kind: "delete"; name: string };

export function defaultNameInUse<T>(defaults: readonly NamedDefault<T>[], name: string, except?: string): boolean {
  const key = name.trim().toLowerCase();
  return defaults.some((item) => item.name !== except && item.name.toLowerCase() === key);
}

export function editNamedDefaults<T>(
  defaults: NamedDefault<T>[],
  edit: NamedDefaultEdit<T>,
  merge: (previous: T, next: T) => T,
): NamedDefault<T>[] | null {
  if (edit.kind === "save") {
    const name = edit.name.trim();
    if (!name || defaultNameInUse(defaults, name)) return null;
    return [...defaults, { name, value: edit.value }];
  }

  const selected = defaults.find(({ name }) => name === edit.name);
  if (!selected) return null;
  if (edit.kind === "delete") return defaults.filter((item) => item !== selected);
  if (edit.kind === "rename") {
    const name = edit.nextName.trim();
    if (!name || defaultNameInUse(defaults, name, selected.name)) return null;
    return defaults.map((item) => item === selected ? { ...item, name } : item);
  }

  const value = merge(selected.value, edit.value);
  return defaults.map((item) => item === selected ? { ...item, value } : item);
}
