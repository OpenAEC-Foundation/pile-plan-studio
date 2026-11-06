import { expect, test, vi } from "vitest";
import { MAX_FEEDBACK_IMAGE_BYTES, submitFeedback, trustedFeedbackIssueUrl, validateFeedbackImages } from "./feedbackClient.ts";

const base = { message: "A clear public feedback message", category: "bug" as const, images: [] as File[] };
const reply = (body: unknown, status = 200) => ({ ok: status === 200, status, json: async () => body });
test("multipart payload keeps contact details separate from public text and includes all selected images", async () => {
  const request = vi.fn().mockResolvedValue(reply({ success: true, githubIssueUrl: null })); vi.stubGlobal("fetch", request);
  const files = [new File(["first"], "a.png", { type: "image/png" }), new File(["second"], "b.jpg", { type: "image/jpeg" })];
  await expect(submitFeedback({ ...base, images: files, fullname: " Reporter ", email: " reply@example.org ",
    appVersion: "2026.44.4", osInfo: "Windows 11" })).resolves.toEqual({ issueUrl: null });
  const options = request.mock.calls[0][1], form: FormData = options.body;
  expect(options.credentials).toBe("omit"); expect(options.headers).toBeUndefined();
  expect(form.get("fullname")).toBe("Reporter"); expect(form.get("email")).toBe("reply@example.org");
  expect(form.get("message")).not.toContain("Reporter"); expect(form.get("message")).not.toContain("reply@example.org");
  expect(form.get("message")).toContain("Windows 11"); expect(form.get("sentiment")).toBeNull();
  expect(form.getAll("images")).toHaveLength(2); expect((form.getAll("images")[1] as File).name).toBe("b.jpg");
});

test.each([[429,"errorRateLimit"],[409,"errorDuplicate"],[400,"errorRejected"],[503,"errorGeneric"]] as const)("maps HTTP %i without retrying", async (status, code) => {
  const request = vi.fn().mockResolvedValue(reply({}, status)); vi.stubGlobal("fetch", request);
  await expect(submitFeedback(base)).rejects.toMatchObject({ code }); expect(request).toHaveBeenCalledOnce();
});
test.each([{}, { success: false }, null, "ok"])("rejects unacknowledged receipts %j", async body => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(body)));
  await expect(submitFeedback(base)).rejects.toMatchObject({ code: "errorGeneric" });
});
test("network failure preserves ambiguous delivery instead of retrying automatically", async () => {
  const request = vi.fn().mockRejectedValue(new Error("offline")); vi.stubGlobal("fetch", request);
  await expect(submitFeedback(base)).rejects.toMatchObject({ code: "errorGeneric" }); expect(request).toHaveBeenCalledOnce();
});
test("a stalled request times out and is not retried", async () => {
  vi.useFakeTimers();
  const request = vi.fn().mockImplementation((_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(new Error("aborted")));
  }));
  vi.stubGlobal("fetch", request);
  const outcome = expect(submitFeedback(base)).rejects.toMatchObject({ code: "errorGeneric" });
  await vi.advanceTimersByTimeAsync(30_000); await outcome; expect(request).toHaveBeenCalledOnce();
});
test("image validation enforces exactly the public API limits", () => {
  const image = (size: number, type = "image/png") => new File([new Uint8Array(size)], "image", { type });
  expect(() => validateFeedbackImages([image(MAX_FEEDBACK_IMAGE_BYTES)])).not.toThrow();
  expect(() => validateFeedbackImages([image(MAX_FEEDBACK_IMAGE_BYTES),image(1)])).toThrow("errorImagesSize");
  expect(() => validateFeedbackImages([image(1),image(1),image(1),image(1)])).toThrow("errorImagesCount");
  expect(() => validateFeedbackImages([image(1,"image/svg+xml")])).toThrow("errorImageType");
});
test("invalid drafts never reach the service, and maximum-length metadata fits its message limit", async () => {
  const request = vi.fn().mockResolvedValue(reply({ success: true })); vi.stubGlobal("fetch", request);
  await expect(submitFeedback({ ...base, message: "short" })).rejects.toMatchObject({ code: "errorTooShort" });
  await expect(submitFeedback({ ...base, email: "invalid" })).rejects.toMatchObject({ code: "errorInvalidEmail" });
  expect(request).not.toHaveBeenCalled();
  await submitFeedback({ ...base, message: "x".repeat(4800), osInfo: "y".repeat(500) });
  expect((request.mock.calls[0][1].body.get("message") as string).length).toBeLessThanOrEqual(5000);
});
test("only the product repository's HTTPS issue links can be opened", () => {
  expect(trustedFeedbackIssueUrl("https://github.com/OpenAEC-Foundation/pile-plan-studio/issues/12")).toBeTruthy();
  for (const value of ["javascript:alert(1)","https://github.com.evil.org/OpenAEC-Foundation/pile-plan-studio/issues/12",
    "https://github.com/other/repo/issues/12","https://user@github.com/OpenAEC-Foundation/pile-plan-studio/issues/12",null]) {
    expect(trustedFeedbackIssueUrl(value)).toBeNull();
  }
});
