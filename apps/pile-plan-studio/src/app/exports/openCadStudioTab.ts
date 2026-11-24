type CadFile = { fileName: string; bytes: Uint8Array };

export async function openCadStudioTab(
  generateDwg: () => Promise<CadFile>,
  messages: { popupBlocked: string; openFailed: string },
): Promise<void> {
  const url = new URL("./cad-studio.html", window.location.href);
  const token = crypto.randomUUID();
  url.searchParams.set("handoff", token);
  const tab = window.open(url, "_blank");
  if (!tab) throw new Error(messages.popupBlocked);

  const channel = new MessageChannel();
  let cleanup = () => {};
  try {
    const opened = new Promise<void>((resolve, reject) => {
      const onMessage = (event: MessageEvent) => {
        if (event.source !== tab || event.origin !== url.origin || event.data?.handoff !== token) return;
        window.removeEventListener("message", onMessage);
        tab.postMessage({ handoff: token }, url.origin, [channel.port2]);
      };
      window.addEventListener("message", onMessage);
      channel.port1.onmessage = ({ data }) => {
        if (data?.type === "loaded") resolve();
        if (data?.type === "error") {
          console.error(data.message);
          reject(new Error(messages.openFailed));
        }
      };
      const timeout = window.setTimeout(() => reject(new Error(messages.openFailed)), 120_000);
      const closed = window.setInterval(() => {
        if (tab.closed) reject(new Error(messages.openFailed));
      }, 500);
      cleanup = () => {
        window.removeEventListener("message", onMessage);
        window.clearTimeout(timeout);
        window.clearInterval(closed);
        channel.port1.close();
      };
    });
    const send = generateDwg().then(({ fileName, bytes }) => {
      const buffer = Uint8Array.from(bytes).buffer;
      channel.port1.postMessage({ name: fileName, buffer }, [buffer]);
    });
    await Promise.all([send, opened]);
  } catch (error) {
    tab.close();
    throw error;
  } finally {
    cleanup();
  }
}
