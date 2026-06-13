import {test} from "node:test";
import assert from "node:assert/strict";
import {formatSyncStatus, syncStatusTone, testSyncConnection, type CloudSyncStatus} from "./cloudSync.ts";

test("formatSyncStatus formats disabled, active, success, conflict, and error states", () => {
  assert.equal(formatSyncStatus({status: "disabled", lastSyncedAt: null}), "同步关闭");
  assert.equal(formatSyncStatus({status: "syncing", lastSyncedAt: null}), "同步中");
  assert.equal(formatSyncStatus({status: "idle", lastSyncedAt: null}), "待同步");
  assert.equal(formatSyncStatus({status: "conflict", lastSyncedAt: null}), "同步冲突");
  assert.equal(formatSyncStatus({status: "error", lastSyncedAt: null}), "同步失败");

  const at = new Date("2026-06-14T09:08:00+08:00").getTime();
  assert.equal(formatSyncStatus({status: "synced", lastSyncedAt: at}), "已同步 09:08");
});

test("syncStatusTone maps status to neutral, success, warning, and danger tones", () => {
  const cases: Array<[CloudSyncStatus["status"], ReturnType<typeof syncStatusTone>]> = [
    ["disabled", "muted"],
    ["idle", "muted"],
    ["syncing", "accent"],
    ["synced", "success"],
    ["conflict", "warning"],
    ["error", "danger"],
  ];

  for (const [status, tone] of cases) {
    assert.equal(syncStatusTone(status), tone);
  }
});

test("testSyncConnection invokes the WebDAV credential test command", async () => {
  const previousInternals = (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__;
  let calledWith: {cmd: string; args: unknown} | null = null;

  (window as unknown as {__TAURI_INTERNALS__: {invoke: (cmd: string, args: unknown) => Promise<unknown>}}).__TAURI_INTERNALS__ = {
    invoke: async (cmd, args) => {
      calledWith = {cmd, args};
      return {ok: true, message: "连接成功"};
    },
  };

  try {
    const result = await testSyncConnection({
      provider: "nutstore",
      username: " user@example.com ",
      password: " app-password ",
      remoteDir: " VellumStyle ",
    });

    assert.deepEqual(calledWith, {
      cmd: "test_sync_connection",
      args: {
        provider: "nutstore",
        username: "user@example.com",
        password: "app-password",
        remoteDir: "VellumStyle",
      },
    });
    assert.deepEqual(result, {ok: true, message: "连接成功"});
  } finally {
    if (previousInternals === undefined) {
      delete (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__;
    } else {
      (window as unknown as {__TAURI_INTERNALS__?: unknown}).__TAURI_INTERNALS__ = previousInternals;
    }
  }
});
