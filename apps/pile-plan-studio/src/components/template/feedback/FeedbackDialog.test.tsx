import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import FeedbackDialog from "./FeedbackDialog.tsx";
import i18n from "../../../i18n/config.ts";

const external = vi.hoisted(() => ({ open: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@tauri-apps/api/app", () => ({ getVersion: async () => "test-version" }));
vi.mock("@tauri-apps/plugin-os", () => ({ type: () => "windows", version: () => "test", arch: () => "x64" }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: external.open }));
vi.mock("html2canvas", () => ({ default: vi.fn() }));
const t = (key: string) => i18n.t(key, { ns: "feedback" });
const issueUrl = "https://github.com/OpenAEC-Foundation/pile-plan-studio/issues/123";
const reply = (body: object, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
function fill() { fireEvent.change(screen.getByRole("textbox", { name: t("message") }), { target: { value: "My public feedback\nSomething to improve." } }); }

test("shared feedback form posts account-free public feedback and opens only the returned issue on request", async () => {
  const request = vi.fn().mockResolvedValue(reply({ success: true, githubIssueUrl: issueUrl }));
  vi.stubGlobal("fetch", request); external.open.mockClear();
  const view = render(<FeedbackDialog open onClose={vi.fn()} />);
  expect(view.container.querySelector("dialog.oa-dialog")).toBeTruthy();
  expect(screen.getByText(t("publicNotice"))).toBeTruthy();
  expect(screen.queryByRole("group", { name: /feeling/i })).toBeNull();
  const send = screen.getByRole("button", { name: t("submit") });
  expect((send as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByRole("textbox", { name: t("message") }), { target: { value: "short" } });
  expect((send as HTMLButtonElement).disabled).toBe(true);
  fill(); fireEvent.click(send);
  await waitFor(() => expect(screen.getByText(t("issueCreated"))).toBeTruthy());
  expect(request).toHaveBeenCalledOnce();
  expect(request.mock.calls[0][0]).toBe("https://open-feedback-studio.pages.dev/api/feedback");
  const options = request.mock.calls[0][1];
  expect(options.method).toBe("POST"); expect(options.headers).toBeUndefined();
  expect(options.body.get("app")).toBe("open-pile-plan-studio");
  expect(options.body.get("message")).toContain("My public feedback");
  expect(options.body.get("sentiment")).toBeNull();
  expect(external.open).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: t("viewIssue") }));
  await waitFor(() => expect(external.open).toHaveBeenCalledWith(issueUrl));
});

test("failed submission retains the draft and rate-limit explanation", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply({ error: "Rate limit exceeded" }, 429)));
  render(<FeedbackDialog open onClose={vi.fn()} />); fill();
  fireEvent.click(screen.getByRole("button", { name: t("submit") }));
  await waitFor(() => expect(screen.getByText(t("errorRateLimit"))).toBeTruthy());
  expect((screen.getByRole("textbox", { name: t("message") }) as HTMLTextAreaElement).value).toContain("My public feedback");
  expect((screen.getByRole("button", { name: t("submit") }) as HTMLButtonElement).disabled).toBe(false);
});

test("acknowledged storage without an issue link never claims that an issue exists", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply({ success: true, githubIssueUrl: null })));
  render(<FeedbackDialog open onClose={vi.fn()} />); fill();
  fireEvent.click(screen.getByRole("button", { name: t("submit") }));
  await waitFor(() => expect(screen.getByText(t("storedMessage"))).toBeTruthy());
  expect(screen.queryByRole("button", { name: t("viewIssue") })).toBeNull();
  expect(screen.queryByText(t("issueCreated"))).toBeNull();
});

test("pending submission cannot be sent twice or dismissed before its receipt", async () => {
  let finish!: (value: ReturnType<typeof reply>) => void;
  const request = vi.fn().mockImplementation(() => new Promise<ReturnType<typeof reply>>(resolve => { finish = resolve; }));
  vi.stubGlobal("fetch", request); const close = vi.fn();
  const view = render(<FeedbackDialog open onClose={close} />); fill();
  const send = screen.getByRole("button", { name: t("submit") }); fireEvent.click(send); fireEvent.click(send);
  fireEvent.click(screen.getByRole("button", { name: i18n.t("close") }));
  fireEvent(view.container.querySelector("dialog")!, new Event("cancel", { cancelable: true, bubbles: true }));
  expect(close).not.toHaveBeenCalled(); expect(request).toHaveBeenCalledOnce();
  await act(async () => { finish(reply({ success: true, githubIssueUrl: null })); });
  expect(screen.getByText(t("storedMessage"))).toBeTruthy();
});

test("pasted and selected images are sent together and only removed previews are revoked", async () => {
  const create = vi.fn().mockImplementation((file: File) => "blob:" + file.name), revoke = vi.fn();
  vi.stubGlobal("URL", class extends URL { static createObjectURL = create; static revokeObjectURL = revoke; });
  const request = vi.fn().mockResolvedValue(reply({ success: true, githubIssueUrl: null })); vi.stubGlobal("fetch", request);
  const view = render(<FeedbackDialog open onClose={vi.fn()} />); fill();
  const first = new File(["a"], "first.png", { type: "image/png" }), second = new File(["b"], "second.png", { type: "image/png" });
  fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: [first] } });
  fireEvent.paste(screen.getByRole("textbox", { name: t("message") }), { clipboardData: { items: [{ kind: "file", type: second.type, getAsFile: () => second }] } });
  expect(screen.getAllByRole("img")).toHaveLength(2); expect(revoke).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: i18n.t("removeImage", { ns: "feedback", number: 1 }) }));
  expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:first.png");
  fireEvent.click(screen.getByRole("button", { name: t("submit") }));
  await waitFor(() => expect(request).toHaveBeenCalledOnce());
  const files: File[] = request.mock.calls[0][1].body.getAll("images");
  expect(files.map(file => file.name)).toEqual(["second.png"]);
  view.unmount(); expect(revoke).toHaveBeenCalledWith("blob:second.png");
});

test("failed requests keep image previews and reopening clears the draft", async () => {
  const create = vi.fn().mockReturnValue("blob:kept"), revoke = vi.fn();
  vi.stubGlobal("URL", class extends URL { static createObjectURL = create; static revokeObjectURL = revoke; });
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  const props = { onClose: vi.fn() }, view = render(<FeedbackDialog {...props} open />); fill();
  fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: [new File(["a"], "kept.png", { type: "image/png" })] } });
  fireEvent.click(screen.getByRole("button", { name: t("submit") }));
  await waitFor(() => expect(screen.getByText(t("errorGeneric"))).toBeTruthy());
  expect(screen.getByRole("img").getAttribute("src")).toBe("blob:kept"); expect(revoke).not.toHaveBeenCalled();
  view.rerender(<FeedbackDialog {...props} open={false} />); expect(revoke).toHaveBeenCalledWith("blob:kept");
  view.rerender(<FeedbackDialog {...props} open />);
  expect((screen.getByRole("textbox", { name: t("message") }) as HTMLTextAreaElement).value).toBe("");
  expect(screen.queryByRole("img")).toBeNull();
});

test("closing the unmounted feedback form returns keyboard focus to its opener", async () => {
  const props = { onClose: vi.fn() };
  const view = render(<><button>Open feedback</button><FeedbackDialog {...props} open={false} /></>);
  const opener = screen.getByRole("button", { name: "Open feedback" }); opener.focus();
  view.rerender(<><button>Open feedback</button><FeedbackDialog {...props} open /></>);
  screen.getByRole("textbox", { name: t("message") }).focus();
  view.rerender(<><button>Open feedback</button><FeedbackDialog {...props} open={false} /></>);
  await waitFor(() => expect(document.activeElement).toBe(opener));
});
