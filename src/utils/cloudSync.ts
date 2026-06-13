import {invoke} from "@tauri-apps/api/core";
import {isTauriRuntime} from "./tauriEnv.ts";

export type CloudSyncStatusValue = "disabled" | "idle" | "syncing" | "synced" | "conflict" | "error";
export type CloudSyncTone = "muted" | "accent" | "success" | "warning" | "danger";

export interface CloudSyncStatus {
  status: CloudSyncStatusValue;
  lastSyncedAt: number | null;
  message?: string;
}

export interface CloudSyncRunSummary {
  enabled: boolean;
  syncedAt: number | null;
  uploaded: number;
  downloaded: number;
  deletedLocal: number;
  deletedRemote: number;
  conflicts: number;
  message: string;
}

export interface SyncConnectionInput {
  provider: string;
  username: string;
  password: string;
  remoteDir: string;
}

export interface SyncConnectionTestResult {
  ok: boolean;
  message: string;
}

export function formatSyncStatus(state: CloudSyncStatus): string {
  if (state.status === "disabled") return "同步关闭";
  if (state.status === "syncing") return "同步中";
  if (state.status === "idle") return "待同步";
  if (state.status === "conflict") return "同步冲突";
  if (state.status === "error") return "同步失败";
  if (!state.lastSyncedAt) return "已同步";

  const d = new Date(state.lastSyncedAt);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `已同步 ${hh}:${mm}`;
}

export function syncStatusTone(status: CloudSyncStatusValue): CloudSyncTone {
  if (status === "syncing") return "accent";
  if (status === "synced") return "success";
  if (status === "conflict") return "warning";
  if (status === "error") return "danger";
  return "muted";
}

export async function runCloudSync(): Promise<CloudSyncRunSummary> {
  if (!isTauriRuntime()) {
    return {
      enabled: false,
      syncedAt: null,
      uploaded: 0,
      downloaded: 0,
      deletedLocal: 0,
      deletedRemote: 0,
      conflicts: 0,
      message: "Web 调试模式未启用文件同步",
    };
  }
  return invoke<CloudSyncRunSummary>("sync_documents");
}

export function testSyncConnection(input: SyncConnectionInput): Promise<SyncConnectionTestResult> {
  return invoke<SyncConnectionTestResult>("test_sync_connection", {
    provider: input.provider.trim(),
    username: input.username.trim(),
    password: input.password.trim(),
    remoteDir: input.remoteDir.trim() || "VellumStyle",
  });
}
