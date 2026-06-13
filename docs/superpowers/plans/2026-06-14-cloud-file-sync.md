# 文件自同步系统 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为文澜排版加入本地优先的文档文件自同步系统，首个 provider 使用坚果云 WebDAV。

**Architecture:** Rust 侧负责配置、WebDAV、manifest 三方合并和本地文件写入；前端只调用 Tauri 命令并展示同步状态。同步不阻塞本地保存，冲突时保留本地文件并生成云端冲突副本。

**Tech Stack:** Tauri 2 / Rust reqwest / React 18 / Zustand / node:test / cargo test。

---

## File Structure

- `src-tauri/src/config.rs`：扩展 `AppConfig`，保存同步配置。
- `src-tauri/src/sync.rs`：新增 WebDAV 同步命令、manifest/state 读写、hash、冲突命名。
- `src-tauri/src/lib.rs`：注册同步命令。
- `src/utils/cloudSync.ts`：前端 Tauri 命令封装和状态文案。
- `src/utils/cloudSync.test.ts`：同步状态文案测试。
- `src/store/index.ts`：新增同步状态和队列触发。
- `src/components/Settings/SettingsDialog.tsx`：新增坚果云配置表单。
- `src/components/DocTree/useDocActions.ts`：文档树变更后排队同步。
- `src/App.tsx`：启动后同步一次，状态栏显示同步状态。

## Task 1: Frontend Sync Status Model

- [ ] Write failing `src/utils/cloudSync.test.ts` for status formatting.
- [ ] Run `node --import tsx --import ./src/test/setupDom.ts --test src/utils/cloudSync.test.ts` and confirm it fails because module is missing.
- [ ] Create `src/utils/cloudSync.ts` with `formatSyncStatus`, `syncStatusTone`, and `runCloudSync`.
- [ ] Re-run the focused test and confirm it passes.

## Task 2: Rust Config And Sync Helpers

- [ ] Add failing Rust tests for `SyncConfig::is_configured`, `normalize_remote_dir`, `content_fingerprint`, and `conflict_path`.
- [ ] Run `cd src-tauri && cargo test sync config` and confirm missing helper failures.
- [ ] Extend `config.rs` with `SyncConfig`; add optional args to `save_config`.
- [ ] Create `sync.rs` helper functions and unit tests.
- [ ] Re-run focused Rust tests and confirm they pass.

## Task 3: WebDAV Sync Command

- [ ] Implement `sync_documents(app) -> SyncRunSummary`.
- [ ] Add `get_sync_configured(app)` helper command for UI status if needed.
- [ ] Register `mod sync` and `sync::sync_documents` in `lib.rs`.
- [ ] Run `cd src-tauri && cargo test sync` and `cd src-tauri && cargo build`.

## Task 4: Store Queue And Triggers

- [ ] Add sync state fields and `runSyncNow` / `scheduleCloudSync` to `src/store/index.ts`.
- [ ] Trigger sync after autosave success.
- [ ] Trigger sync after create, rename, delete, and move in `useDocActions.ts`.
- [ ] Run `npm test -- src/utils/cloudSync.test.ts` equivalent focused command, then full `npm test`.

## Task 5: Settings UI And Status Bar

- [ ] Extend `SettingsDialog` config shape and load/save flow.
- [ ] Add a `文件同步` section with enabled checkbox, provider label, account, app password, remote directory.
- [ ] Add sync status text next to save status in `App.tsx`.
- [ ] Run `npm run build`.

## Task 6: Final Verification

- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Run `cd src-tauri && cargo test`.
- [ ] Run `cd src-tauri && cargo build`.
- [ ] Review `git diff --check`.
