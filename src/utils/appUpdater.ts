import {getVersion} from "@tauri-apps/api/app";
import type {DownloadEvent, Update} from "@tauri-apps/plugin-updater";
import {isTauriRuntime} from "./tauriEnv.ts";

export interface AppUpdateCandidate {
  version: string;
  currentVersion: string;
  date?: string;
  body?: string;
  install: (onEvent?: (event: DownloadEvent) => void) => Promise<void>;
}

export type AppUpdateCheckResult =
  | {status: "available"; update: AppUpdateCandidate}
  | {status: "none"; currentVersion: string}
  | {status: "unsupported"; currentVersion: string};

function toUpdateCandidate(update: Update): AppUpdateCandidate {
  return {
    version: update.version,
    currentVersion: update.currentVersion,
    date: update.date,
    body: update.body,
    install: (onEvent) => update.downloadAndInstall(onEvent),
  };
}

export async function getCurrentAppVersion(): Promise<string> {
  if (!isTauriRuntime()) {
    return "";
  }
  return getVersion();
}

export async function checkForAppUpdate(): Promise<AppUpdateCheckResult> {
  const currentVersion = await getCurrentAppVersion();
  if (!isTauriRuntime()) {
    return {status: "unsupported", currentVersion};
  }

  const {check} = await import("@tauri-apps/plugin-updater");
  const update = await check();
  if (!update) {
    return {status: "none", currentVersion};
  }

  return {status: "available", update: toUpdateCandidate(update)};
}

export async function installAppUpdate(update: AppUpdateCandidate, onEvent?: (event: DownloadEvent) => void): Promise<void> {
  await update.install(onEvent);
  const {relaunch} = await import("@tauri-apps/plugin-process");
  await relaunch();
}

export function formatAppUpdateError(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as {message?: unknown}).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }
  return "检查更新失败";
}
