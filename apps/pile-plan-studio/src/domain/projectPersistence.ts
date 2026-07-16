export type ProjectFileCommands = {
  save: boolean;
  saveAs: boolean;
  download: boolean;
};

export type GeneratedFileOptions = {
  fileName: string;
  mimeType: string;
  extensions: string[];
};

type PickedFile = {
  write: (blob: Blob) => Promise<void>;
};

export type FileSaveEnvironment = {
  pickFile?: (options: GeneratedFileOptions) => Promise<PickedFile | null>;
  downloadFile: (blob: Blob, fileName: string) => void;
  waitForPaint?: () => Promise<void>;
  waitForDownloadHandoff?: () => Promise<void>;
};

export type BinarySaveEnvironment = {
  isDesktop: boolean;
  saveDesktop?: (options: GeneratedFileOptions, bytes: Uint8Array) => Promise<boolean>;
  browser?: FileSaveEnvironment;
};

export function getProjectFileCommands(isDesktop: boolean): ProjectFileCommands {
  return isDesktop
    ? { save: true, saveAs: true, download: false }
    : { save: false, saveAs: false, download: true };
}

export function projectFileName(projectName: string): string {
  const safeName = safeProjectName(projectName);
  return `${safeName || "pile-plan-project"}.ifcpp`;
}

export function pilePlanExportFileName(projectName: string, format: "xlsx" | "csv"): string {
  const safeName = safeProjectName(projectName) || "pile-plan-project";
  return `${safeName}-pile-plan.${format}`;
}

export function isDesktopRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export function downloadTextFile(text: string, fileName: string): void {
  downloadBlob(new Blob([text], { type: "application/json" }), fileName);
}

export async function saveGeneratedFile(
  options: GeneratedFileOptions,
  createBlob: () => Promise<Blob>,
  environment: FileSaveEnvironment = browserFileSaveEnvironment(),
): Promise<boolean> {
  let pickedFile: PickedFile | null = null;
  if (environment.pickFile) {
    try {
      pickedFile = await environment.pickFile(options);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return false;
      throw error;
    }
    if (!pickedFile) return false;
  }

  if (!pickedFile) await environment.waitForPaint?.();
  const blob = await createBlob();
  if (pickedFile) {
    await pickedFile.write(blob);
  } else {
    environment.downloadFile(blob, options.fileName);
    await environment.waitForDownloadHandoff?.();
  }
  return true;
}

export async function savePreparedFile(
  options: GeneratedFileOptions,
  blob: Blob,
  environment: FileSaveEnvironment = browserFileSaveEnvironment(),
): Promise<boolean> {
  if (!environment.pickFile) {
    await environment.waitForPaint?.();
    environment.downloadFile(blob, options.fileName);
    await environment.waitForDownloadHandoff?.();
    return true;
  }

  return environment.pickFile(options)
    .then(async (pickedFile) => {
      if (!pickedFile) return false;
      await pickedFile.write(blob);
      return true;
    })
    .catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return false;
      throw error;
    });
}

export async function saveBinaryExport(
  options: GeneratedFileOptions,
  bytes: Uint8Array,
  environment: BinarySaveEnvironment = {
    isDesktop: isDesktopRuntime(),
  },
): Promise<boolean> {
  if (!environment.isDesktop) {
    const blobBytes = Uint8Array.from(bytes);
    return savePreparedFile(
      options,
      new Blob([blobBytes.buffer], { type: options.mimeType }),
      environment.browser ?? browserFileSaveEnvironment(),
    );
  }

  if (environment.saveDesktop) {
    return environment.saveDesktop(options, bytes);
  }

  const { save } = await import("@tauri-apps/plugin-dialog");
  const path = await save({
    defaultPath: options.fileName,
    filters: [{
      name: options.fileName,
      extensions: options.extensions.map((extension) => extension.replace(/^\./, "")),
    }],
  });
  if (!path) return false;

  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("write_binary_file", { path, contents: [...bytes] });
  return true;
}

function safeProjectName(projectName: string): string {
  return projectName.trim().replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "");
}

function browserFileSaveEnvironment(): FileSaveEnvironment {
  const picker = (window as Window & {
    showSaveFilePicker?: (options: unknown) => Promise<{
      createWritable: () => Promise<{ write: (blob: Blob) => Promise<void>; close: () => Promise<void> }>;
    }>;
  }).showSaveFilePicker;

  return {
    pickFile: picker ? async (options) => {
      const handle = await picker({
        suggestedName: options.fileName,
        types: [{
          description: options.fileName,
          accept: { [options.mimeType]: options.extensions },
        }],
      });
      return {
        write: async (blob) => {
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
        },
      };
    } : undefined,
    downloadFile: downloadBlob,
    waitForPaint: waitForBrowserPaint,
    waitForDownloadHandoff: () => new Promise((resolve) => window.setTimeout(resolve, 2000)),
  };
}

function waitForBrowserPaint(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
  });
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 1000);
}
