import { downloadBlob } from "../../domain/project/projectPersistence.ts";

const frame = document.querySelector("iframe")!;
const opener = window.opener as Window | null;
const origin = window.location.origin;
const handoff = new URLSearchParams(window.location.search).get("handoff");
let port: MessagePort | null = null;
let drawing: { name: string; buffer: ArrayBuffer } | null = null;
let studioReady = false;

window.addEventListener("message", ({ source, origin: sender, data, ports }: MessageEvent) => {
  if (sender !== origin || !data) return;
  if (source === opener && handoff && data.handoff === handoff && !port && ports.length === 1) {
    port = ports[0];
    port.onmessage = ({ data: file }) => {
      if (typeof file?.name !== "string" || !(file.buffer instanceof ArrayBuffer)) return;
      drawing = file;
      openDrawing();
    };
    window.opener = null;
  }
  if (source !== frame.contentWindow || data.source !== "opencadstudio-embed") return;
  if (data.type === "ocs:ready") {
    studioReady = true;
    openDrawing();
  }
  if (data.type === "ocs:loaded") {
    document.title = data.name + " – Open CAD Studio";
    port?.postMessage({ type: "loaded" });
  }
  if (data.type === "ocs:error") port?.postMessage({ type: "error", message: data.message });
  if (data.type === "ocs:save" && (data.format === "dwg" || data.format === "dxf")
    && typeof data.name === "string" && data.buffer instanceof ArrayBuffer) {
    downloadBlob(new Blob([data.buffer], { type: "application/octet-stream" }), data.name);
    frame.contentWindow?.postMessage({
      source: "opencadstudio-host",
      type: "ocs:saved",
      saveId: data.saveId,
      name: data.name,
      ok: true,
    }, origin);
  }
});

function openDrawing() {
  if (!studioReady || !drawing || !frame.contentWindow) return;
  frame.contentWindow.postMessage({
    source: "opencadstudio-host",
    type: "ocs:open",
    name: drawing.name,
    buffer: drawing.buffer,
    readOnly: false,
  }, origin, [drawing.buffer]);
  drawing = null;
}

frame.src = "./app/index.html?embed=1";
if (handoff) opener?.postMessage({ handoff }, origin);
export {};
