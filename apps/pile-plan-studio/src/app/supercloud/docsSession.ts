export type HostVersion = string | number;
export type HostFileRef = { id: string; name: string; version: HostVersion };
export type DocsFile = HostFileRef & { readOnly: boolean };

export interface SiteHost {
  taal?: string;
  thema?: string;
  initialFileId?: string;
  open(id: string, version?: HostVersion): Promise<DocsFile & { bytes: Uint8Array | ArrayBuffer }>;
  save(bytes: Uint8Array, options: { id?: string; name?: string; expectedVersion?: HostVersion }): Promise<HostFileRef>;
  list(): Promise<{ id: string; name: string; modified: string }[]>;
  versions(id: string): Promise<{ version: HostVersion; modified: string; author?: string }[]>;
  settings?: {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<unknown>;
    delete(key: string): Promise<unknown>;
  };
}

declare global {
  interface Window { openaecHost?: SiteHost }
}

export function createDocsSession() {
  let current: DocsFile | null = null;
  let generation = 0;
  return {
    get file() { return current; },
    async read(host: SiteHost, id: string) {
      const { bytes, ...file } = await host.open(id);
      return { file, contents: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
    },
    install(file: DocsFile | null) {
      current = file;
      generation++;
    },
    async save(host: SiteHost, contents: string, name: string, saveAs: boolean) {
      if (current?.readOnly && !saveAs) throw new Error("Docs file is read-only");
      const started = generation;
      const options = current && !saveAs
        ? { id: current.id, expectedVersion: current.version }
        : { name };
      const saved = await host.save(new TextEncoder().encode(contents), options);
      if (generation !== started) return null;
      current = { ...saved, readOnly: false };
      generation++;
      return current;
    },
  };
}
