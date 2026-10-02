import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config.ts";

export default defineConfig(mergeConfig(viteConfig, {
  server: { fs: { allow: ["../.."] } },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.tsx"],
    setupFiles: ["src/test/uiSetup.ts"],
    maxWorkers: 2,
    pool: "threads",
  },
}));
