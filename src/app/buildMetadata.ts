import { getVersion } from "@tauri-apps/api/app";
import packageMetadata from "../../package.json";
import { isTauriRuntime } from "../platform/system";

declare const __BUILD_GIT_SHA__: string;
declare const __BUILD_GIT_DIRTY__: boolean;

export type BuildChannel = "Dev" | "Release";

export const buildChannel: BuildChannel = import.meta.env.PROD ? "Release" : "Dev";
export const buildGitSha = __BUILD_GIT_SHA__ || "unknown";
export const buildIsModified = __BUILD_GIT_DIRTY__;

export function buildLabel(channel: BuildChannel = buildChannel, sha = buildGitSha, modified = buildIsModified): string {
  return [channel, sha, ...(modified ? ["modified"] : [])].join(" · ");
}

export async function loadAppVersion(): Promise<string> {
  if (isTauriRuntime()) {
    try {
      const version = await getVersion();
      return version.startsWith("v") ? version : `v${version}`;
    } catch {
      // Browser/demo and older runtimes can lack the Tauri app API.
    }
  }
  return typeof packageMetadata.version === "string" && packageMetadata.version ? `v${packageMetadata.version}` : "unknown";
}
