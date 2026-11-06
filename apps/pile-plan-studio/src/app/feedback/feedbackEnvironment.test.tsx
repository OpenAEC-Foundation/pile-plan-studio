import { expect, test, vi } from "vitest";
import html2canvas from "html2canvas";
import { captureFeedbackScreenshot } from "./feedbackEnvironment.ts";
vi.mock("html2canvas", () => ({ default: vi.fn() }));

test("screenshot delegates modern theme colors to the browser and excludes the feedback window", async () => {
  vi.mocked(html2canvas).mockResolvedValue({ toBlob: (callback: BlobCallback) => callback(new Blob(["image"], { type: "image/png" })) } as HTMLCanvasElement);
  const file = await captureFeedbackScreenshot();
  expect(file.type).toBe("image/png");
  const options = vi.mocked(html2canvas).mock.calls[0][1]!;
  expect(options.foreignObjectRendering).toBe(true);
  expect(options.scale).toBeLessThanOrEqual(1);
  const dialog = document.createElement("div"); dialog.className = "feedback-blueprint";
  expect(options.ignoreElements!(dialog)).toBe(true);
});
