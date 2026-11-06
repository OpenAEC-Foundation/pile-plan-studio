export const FEEDBACK_ENDPOINT = "https://open-feedback-studio.pages.dev/api/feedback";
export const FEEDBACK_APP = "open-pile-plan-studio";
export const MIN_FEEDBACK_LENGTH = 10;
export const MAX_FEEDBACK_LENGTH = 4800;
export const MAX_FEEDBACK_IMAGES = 3;
export const MAX_FEEDBACK_IMAGE_BYTES = 1024 * 1024;
export const FEEDBACK_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export type FeedbackCategory = "general" | "bug" | "feature";
export type FeedbackErrorCode = "errorTooShort" | "errorTooLong" | "errorImagesCount" | "errorImagesSize"
  | "errorImageType" | "errorInvalidEmail" | "errorName" | "errorRateLimit" | "errorDuplicate"
  | "errorRejected" | "errorGeneric" | "errorScreenshot" | "errorOpenIssue";
export class FeedbackError extends Error {
  constructor(readonly code: FeedbackErrorCode) { super(code); this.name = "FeedbackError"; }
}
export type FeedbackSubmission = {
  message: string;
  category: FeedbackCategory;
  fullname?: string;
  email?: string;
  appVersion?: string;
  osInfo?: string;
  images: File[];
};

export function validateFeedbackImages(images: readonly File[]): void {
  if (images.length > MAX_FEEDBACK_IMAGES) throw new FeedbackError("errorImagesCount");
  if (images.some(image => !FEEDBACK_IMAGE_TYPES.includes(image.type))) throw new FeedbackError("errorImageType");
  if (images.reduce((bytes, image) => bytes + image.size, 0) > MAX_FEEDBACK_IMAGE_BYTES) throw new FeedbackError("errorImagesSize");
}

export function trustedFeedbackIssueUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "github.com" && !url.port && !url.username && !url.password
      && !url.search && !url.hash && /^\/OpenAEC-Foundation\/pile-plan-studio\/issues\/[1-9]\d*\/?$/i.test(url.pathname)
      ? url.href : null;
  } catch { return null; }
}

export async function submitFeedback(input: FeedbackSubmission): Promise<{ issueUrl: string | null }> {
  const message = input.message.trim();
  if (message.length < MIN_FEEDBACK_LENGTH) throw new FeedbackError("errorTooShort");
  if (message.length > MAX_FEEDBACK_LENGTH) throw new FeedbackError("errorTooLong");
  if ((input.fullname?.trim().length ?? 0) > 200) throw new FeedbackError("errorName");
  const email = input.email?.trim();
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw new FeedbackError("errorInvalidEmail");
  validateFeedbackImages(input.images);
  const os = input.osInfo?.replace(/\s+/g, " ").trim().slice(0, 120);
  const form = new FormData();
  form.set("app", FEEDBACK_APP);
  form.set("category", input.category);
  form.set("message", os ? `${message}\n\n---\nOS: ${os}` : message);
  if (input.fullname?.trim()) form.set("fullname", input.fullname.trim());
  if (email) form.set("email", email);
  if (input.appVersion) form.set("appVersion", input.appVersion);
  for (const image of input.images) form.append("images", image, image.name);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(FEEDBACK_ENDPOINT, { method: "POST", body: form, credentials: "omit", signal: controller.signal });
    if (!response.ok) throw new FeedbackError(response.status === 429 ? "errorRateLimit"
      : response.status === 409 ? "errorDuplicate" : response.status === 400 ? "errorRejected" : "errorGeneric");
    const receipt: unknown = await response.json();
    if (!receipt || typeof receipt !== "object" || !("success" in receipt) || receipt.success !== true) {
      throw new FeedbackError("errorGeneric");
    }
    return { issueUrl: trustedFeedbackIssueUrl("githubIssueUrl" in receipt ? receipt.githubIssueUrl : null) };
  } catch (error) {
    throw error instanceof FeedbackError ? error : new FeedbackError("errorGeneric");
  } finally { clearTimeout(timeout); }
}
