import html2canvas from "html2canvas";
import { FeedbackError, MAX_FEEDBACK_IMAGE_BYTES } from "./feedbackClient.ts";

export async function getFeedbackEnvironment(): Promise<{ appVersion: string; osInfo: string }> {
  const version = import("@tauri-apps/api/app").then(api => api.getVersion()).catch(() => __APP_VERSION__);
  const system = import("@tauri-apps/plugin-os").then(os =>
    `${os.type()} ${os.version()} (${os.arch()})`.replace(/\s+/g, " ").trim(),
  ).catch(() => navigator.platform || "Unknown");
  const [appVersion, osInfo] = await Promise.all([version, system]);
  return { appVersion, osInfo };
}

export async function openFeedbackIssue(url: string): Promise<void> {
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export async function captureFeedbackScreenshot(): Promise<File> {
  try {
    const canvas = await html2canvas(document.body, {
      backgroundColor: null, logging: false,
      // The legacy canvas parser cannot read Blueprint's computed color() values.
      foreignObjectRendering: true,
      scale: Math.min(1, 1440 / window.innerWidth),
      ignoreElements: element => element.classList.contains("feedback-blueprint"),
    });
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("No screenshot data");
    if (blob.size <= MAX_FEEDBACK_IMAGE_BYTES) return new File([blob], "screenshot.png", { type: blob.type });
    const compressed = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.8));
    if (!compressed) throw new Error("No screenshot data");
    return new File([compressed], "screenshot.jpg", { type: compressed.type });
  } catch (error) {
    console.warn("Feedback screenshot capture failed", error);
    throw new FeedbackError("errorScreenshot");
  }
}
