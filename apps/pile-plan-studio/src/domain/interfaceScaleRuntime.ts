import { getSetting, setSetting } from "../store.ts";
import { isDesktopRuntime } from "./projectPersistence.ts";
import { DEFAULT_INTERFACE_SCALE, normalizeInterfaceScale } from "./interfaceScale.ts";
import { BROWSER_BASELINE_ZOOM } from "./uiBaseline.ts";

const INTERFACE_SCALE_KEY = "interface-scale-percent";

type InterfaceScaleEnvironment = {
  isDesktop?: boolean;
  getSetting?: (key: string, fallback: number) => Promise<number>;
  setSetting?: (key: string, value: number) => Promise<void>;
  setZoom?: (factor: number) => Promise<void>;
};

export async function loadInterfaceScale(environment: InterfaceScaleEnvironment = {}): Promise<number> {
  const read = environment.getSetting ?? getSetting<number>;
  return normalizeInterfaceScale(await read(INTERFACE_SCALE_KEY, DEFAULT_INTERFACE_SCALE));
}

export async function saveInterfaceScale(
  scalePercent: number,
  environment: InterfaceScaleEnvironment = {},
): Promise<void> {
  const write = environment.setSetting ?? setSetting<number>;
  await write(INTERFACE_SCALE_KEY, normalizeInterfaceScale(scalePercent));
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
    await setZoom(BROWSER_BASELINE_ZOOM * normalizeInterfaceScale(scalePercent) / 100);
    return true;
  } catch (error) {
    console.error("Failed to apply desktop interface scale", error);
    return false;
  }
}
