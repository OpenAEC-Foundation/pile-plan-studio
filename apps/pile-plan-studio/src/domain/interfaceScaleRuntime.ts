import { isDesktopRuntime } from "./projectPersistence.ts";
import { normalizeInterfaceScale } from "./interfaceScale.ts";

type InterfaceScaleEnvironment = {
  isDesktop?: boolean;
  setZoom?: (factor: number) => Promise<void>;
};

export function applicationScaleFactor(scalePercent: number): number {
  return normalizeInterfaceScale(scalePercent) / 100;
}

export async function applyDesktopInterfaceScale(
  scalePercent: number,
  environment: InterfaceScaleEnvironment = {},
): Promise<boolean> {
  if (!(environment.isDesktop ?? isDesktopRuntime())) return false;

  try {
    const setZoom = environment.setZoom ?? (async (factor: number) => {
      const { getCurrentWebview } = await import("@tauri-apps/api/webview");
      await getCurrentWebview().setZoom(factor);
    });
    await setZoom(applicationScaleFactor(scalePercent));
    return true;
  } catch (error) {
    console.error("Failed to apply desktop interface scale", error);
    return false;
  }
}
