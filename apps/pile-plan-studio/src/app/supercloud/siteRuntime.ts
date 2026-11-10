import type { UserLanguage, UserSettings } from "../../domain/settings/userSettings.ts";
import type { UserSettingsStore } from "../../domain/settings/userSettingsStore.ts";
import type { McpSession } from "../mcp/connectionController.ts";
import type { SiteHost } from "./docsSession.ts";
import type { createSiteMcpTools } from "./siteMcpTools.ts";

export const PLATFORM_BUILD = import.meta.env?.MODE === "platform";

type SiteMcpTools = ReturnType<typeof createSiteMcpTools>;

declare global {
  interface Window { __OPDS_APP__?: SiteMcpTools }
}

export function getSiteHost(): SiteHost | undefined {
  return PLATFORM_BUILD ? window.openaecHost : undefined;
}

export function installSiteMcp(createSession: (isActive: () => boolean) => McpSession) {
  let active = true;
  let session: McpSession | undefined;
  const load = () => import("./siteMcpTools.ts");
  const tools: SiteMcpTools = {
    tools: async () => (await tools.definitions()).map(({ name }) => name),
    definitions: async () => (await load()).siteToolDefinitions(),
    run: async (name, args) => {
      const { createSiteMcpTools } = await load();
      if (!active || !getSiteHost()) throw new Error("unavailable");
      return createSiteMcpTools(body => {
        session ??= createSession(() => active && !!getSiteHost());
        return session.dispatch(body);
      }).run(name, args);
    },
  };
  window.__OPDS_APP__ = tools;
  return () => {
    active = false;
    session?.dispose();
    if (window.__OPDS_APP__ === tools) delete window.__OPDS_APP__;
  };
}

const SETTINGS_KEY = "pile-plan-studio.user-settings";

export function createSiteSettingsStore(host?: SiteHost): UserSettingsStore {
  let cached: UserSettings | null = null;
  return {
    async read() {
      try { return (await host?.settings?.get(SETTINGS_KEY)) ?? cached; }
      catch { return cached; }
    },
    async write(settings) {
      cached = settings;
      try { await host?.settings?.set(SETTINGS_KEY, settings); }
      catch { /* Keep the setting for the current frame when the host cannot persist it. */ }
    },
  };
}

export function sitePreferences(host: SiteHost | undefined): { language?: UserLanguage; theme?: string } {
  const locale = host?.taal?.toLowerCase().split("-")[0];
  return {
    language: locale ? (locale === "nl" ? "nl" : "en") : undefined,
    theme: host?.thema === "dark" || host?.thema === "light" ? host.thema : undefined,
  };
}
