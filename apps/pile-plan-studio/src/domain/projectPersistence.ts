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

export function getProjectFileCommands(isDesktop: boolean): ProjectFileCommands {
  return isDesktop
    ? { save: true, saveAs: true, download: false }
    : { save: false, saveAs: false, download: true };
}

export function projectFileName(projectName: string): string {
  const safeName = projectName.trim().replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "");
  return `${safeName || "pile-plan-project"}.ifcpp`;
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
