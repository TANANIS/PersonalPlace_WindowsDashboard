import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { execFileSync } from "node:child_process";

const host = process.env.TAURI_DEV_HOST;

function gitMetadata() {
  try {
    const revision = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim();
    const dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { encoding: "utf8" }).trim().length > 0;
    return { revision: revision || "unknown", dirty };
  } catch {
    return { revision: "unknown", dirty: false };
  }
}

const git = gitMetadata();

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_GIT_SHA__: JSON.stringify(git.revision),
    __BUILD_GIT_DIRTY__: JSON.stringify(git.dirty),
  },
  clearScreen: false,
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: true,
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
  },
});
