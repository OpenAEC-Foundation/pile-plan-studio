export type McpConnection = { endpoint: string; token: string };
export type McpWireMessage = { id: string; body: string };

export type DesktopMcpDependencies = {
  invoke: (name: string) => Promise<unknown>;
  listen: (name: string, handler: (event: { payload: McpWireMessage }) => void) => Promise<() => void>;
  emit: (name: string, payload: McpWireMessage) => Promise<void>;
};

export function createDesktopMcpBridge(dependencies: DesktopMcpDependencies) {
  let unsubscribe: (() => void) | null = null;
  let generation = 0;
  let active = false;

  return {
    async start(dispatch: (body: string) => Promise<string>): Promise<McpConnection> {
      if (active) throw new Error("mcp_already_running");
      const run = ++generation;
      unsubscribe = await dependencies.listen("mcp://request", (event) => {
        const { id, body } = event.payload;
        if (!active || run !== generation) return;
        void dispatch(body).then(async (reply) => {
          if (!active || run !== generation) return;
          await dependencies.emit("mcp://response", { id, body: reply });
        }).catch(async () => {
          if (!active || run !== generation) return;
          await dependencies.emit("mcp://response", { id, body: JSON.stringify({
            jsonrpc: "2.0", id: null, error: { code: -32603, message: "Unavailable" },
          }) });
        });
      });
      active = true;
      try {
        const connection = await dependencies.invoke("mcp_bridge_start") as McpConnection;
        if (run !== generation) {
          await dependencies.invoke("mcp_bridge_stop");
          throw new Error("mcp_start_cancelled");
        }
        active = true;
        return connection;
      } catch (error) {
        if (run === generation) active = false;
        unsubscribe?.();
        unsubscribe = null;
        throw error;
      }
    },
    async stop(): Promise<void> {
      generation += 1;
      active = false;
      unsubscribe?.();
      unsubscribe = null;
      await dependencies.invoke("mcp_bridge_stop");
    },
  };
}
