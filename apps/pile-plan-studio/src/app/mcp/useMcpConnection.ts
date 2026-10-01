import { useEffect, useRef, useState } from "react";
import { createDesktopMcpBridge } from "./desktopBridge.ts";
import { createMcpConnectionController, type McpConnectionState, type McpSession } from "./connectionController.ts";

export function useMcpConnection(
  isDesktop: boolean, createSession: (isActive: () => boolean) => McpSession, disableWrites: () => void,
) {
  const current = useRef({ isDesktop, createSession, disableWrites });
  current.current = { isDesktop, createSession, disableWrites };
  const controller = useRef<ReturnType<typeof createMcpConnectionController> | null>(null);
  const [state, setState] = useState<McpConnectionState>({ status: "off", connection: null, error: null });
  useEffect(() => {
    const active = createMcpConnectionController({
      isDesktop: () => current.current.isDesktop,
      createSession: (isActive) => current.current.createSession(isActive),
      disableWrites: () => current.current.disableWrites(),
      createBridge: async () => {
        const [{ invoke }, { listen, emit }] = await Promise.all([
          import("@tauri-apps/api/core"), import("@tauri-apps/api/event"),
        ]);
        return createDesktopMcpBridge({ invoke, listen, emit });
      },
    });
    controller.current = active;
    const unsubscribe = active.subscribe(setState);
    return () => {
      unsubscribe(); active.dispose();
      if (controller.current === active) controller.current = null;
    };
  }, []);
  return { ...state, setEnabled: (enabled: boolean) => controller.current?.setEnabled(enabled) ?? Promise.resolve() };
}
