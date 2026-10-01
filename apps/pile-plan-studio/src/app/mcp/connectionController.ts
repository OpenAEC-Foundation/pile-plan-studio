import type { createDesktopMcpBridge, McpConnection } from "./desktopBridge.ts";

export type McpSession = { dispatch: (body: string) => Promise<string>; dispose: () => void };
export type McpConnectionState = {
  status: "off" | "starting" | "on" | "stopping" | "error";
  connection: McpConnection | null;
  error: string | null;
};
type Bridge = ReturnType<typeof createDesktopMcpBridge>;
type Dependencies = {
  isDesktop: () => boolean;
  createBridge: () => Promise<Bridge>;
  createSession: (isActive: () => boolean) => McpSession;
  disableWrites: () => void;
};

export function createMcpConnectionController(dependencies: Dependencies) {
  let state: McpConnectionState = { status: "off", connection: null, error: null };
  let generation = 0, disposed = false;
  let bridge: Bridge | null = null, session: McpSession | null = null;
  let pendingStop: Promise<void> | null = null;
  const listeners = new Set<(state: McpConnectionState) => void>();
  const stops = new WeakMap<Bridge, Promise<void>>();
  const starts = new WeakMap<Bridge, Promise<McpConnection>>();
  function stop(target: Bridge | null): Promise<void> {
    if (!target) return Promise.resolve();
    let stopping = stops.get(target);
    if (!stopping) {
      const nativeStop = target.stop();
      stopping = Promise.allSettled([nativeStop, starts.get(target)]).then(() => nativeStop);
      stops.set(target, stopping);
    }
    return stopping;
  }
  function publish(next: McpConnectionState) {
    state = next;
    if (!disposed) for (const listener of listeners) listener(state);
  }
  return {
    getState: () => state,
    subscribe(listener: (state: McpConnectionState) => void) {
      listeners.add(listener);
      listener(state);
      return () => { listeners.delete(listener); };
    },
    async setEnabled(enabled: boolean): Promise<void> {
      if (disposed || (enabled && (!dependencies.isDesktop() || bridge || state.status === "starting"))) return;
      const run = ++generation;
      const isActive = () => !disposed && run === generation;
      if (!enabled) {
        session?.dispose(); session = null;
        dependencies.disableWrites();
        const previous = bridge; bridge = null;
        publish({ ...state, status: "stopping", connection: null });
        const stopping = previous ? stop(previous) : pendingStop ?? Promise.resolve();
        pendingStop = stopping;
        try { await stopping; }
        finally {
          if (pendingStop === stopping) pendingStop = null;
          if (isActive()) publish({ ...state, status: "off" });
        }
        return;
      }
      publish({ status: "starting", connection: null, error: null });
      let created: Bridge | null = null;
      try {
        // The native listener is shared: finish an older stop before starting its replacement.
        if (pendingStop) await pendingStop.catch(() => undefined);
        if (!isActive()) return;
        created = await dependencies.createBridge();
        if (!isActive()) return;
        bridge = created;
        session = dependencies.createSession(isActive);
        const starting = created.start(session.dispatch);
        starts.set(created, starting);
        const connection = await starting;
        if (!isActive()) return;
        publish({ status: "on", connection, error: null });
      } catch (error) {
        if (!isActive()) return;
        session?.dispose(); session = null;
        bridge = null;
        const stopping = stop(created);
        pendingStop = stopping;
        await stopping.catch(() => undefined);
        if (pendingStop === stopping) pendingStop = null;
        if (isActive()) publish({ status: "error", connection: null,
          error: error instanceof Error ? error.message : String(error) });
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true; generation++;
      session?.dispose(); session = null;
      dependencies.disableWrites();
      void stop(bridge).catch(() => undefined); bridge = null;
      state = { ...state, status: "off", connection: null };
      listeners.clear();
    },
  };
}
