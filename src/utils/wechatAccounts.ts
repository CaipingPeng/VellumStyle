import {invoke, type InvokeArgs, type InvokeOptions} from "@tauri-apps/api/core";
import {imageUploadTasks} from "./imageUploadTasks.ts";
import {isTauriRuntime} from "./tauriEnv.ts";
import {migrateLegacyAccountStorage, setStorageAccount} from "./accountStorage.ts";

export interface WechatAccount {name: string; app_id: string; app_secret: string}
export interface WechatAccountSummary {name: string; app_id: string}
export interface WechatAccounts {accounts: WechatAccountSummary[]; active_app_id: string}
let snapshot: WechatAccounts = {accounts: [], active_app_id: ""};
const listeners = new Set<() => void>();
let operations = 0;
let changing = false;

export interface AccountSwitchHandlers {
  beforeSwitch?: () => Promise<void>;
  afterSwitch?: () => Promise<void>;
}

let switchHandlers: AccountSwitchHandlers | null = null;

export function registerAccountSwitchHandlers(handlers: AccountSwitchHandlers): () => void {
  switchHandlers = handlers;
  return () => {
    if (switchHandlers === handlers) {
      switchHandlers = null;
    }
  };
}


export const getWechatAccounts = () => snapshot;
export function subscribeWechatAccounts(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function acceptAccounts(next: WechatAccounts): void {
  // The toolbar receives summaries only, never AppSecret.
  snapshot = next;
  setStorageAccount(next.active_app_id);
  try { migrateLegacyAccountStorage(window.localStorage, next.accounts[0]?.app_id ?? ""); } catch { /* storage may be disabled */ }
  for (const listener of listeners) listener();
}

export async function initializeWechatAccounts(): Promise<void> {
  if (isTauriRuntime()) acceptAccounts(await invoke<WechatAccounts>("list_wechat_accounts"));
}

export function holdWechatAccount(): () => void {
  operations++;
  let released = false;
  return () => { if (!released) { released = true; operations--; } };
}

export async function invokeWechat<T>(cmd: string, args?: InvokeArgs, options?: InvokeOptions): Promise<T> {
  if (changing) throw new Error("公众号正在切换，请稍后重试");
  const release = holdWechatAccount();
  try { return await invoke<T>(cmd, args, options); }
  finally { release(); }
}

async function updateAccounts(action: () => Promise<void>): Promise<void> {
  if (changing || operations || imageUploadTasks.getSnapshot().some((task) => task.status === "active")) {
    throw new Error("请先完成上传、发布，并关闭微信功能窗口后再更改公众号配置");
  }
  changing = true;
  try { await action(); }
  finally { changing = false; }
}

export function switchWechatAccount(appId: string): Promise<void> {
  if (snapshot.active_app_id === appId) return Promise.resolve();
  return updateAccounts(async () => {
    const prevId = snapshot.active_app_id;
    if (switchHandlers?.beforeSwitch) {
      await switchHandlers.beforeSwitch();
    }
    const next = await invoke<WechatAccounts>("switch_wechat_account", {appId});
    acceptAccounts(next);
    if (prevId !== next.active_app_id && switchHandlers?.afterSwitch) {
      await switchHandlers.afterSwitch();
    }
  });
}

export function saveWechatConfiguration(args: Record<string, unknown>): Promise<void> {
  return updateAccounts(async () => {
    const prevId = snapshot.active_app_id;
    if (switchHandlers?.beforeSwitch) {
      await switchHandlers.beforeSwitch();
    }
    const next = await invoke<WechatAccounts>("save_config", args);
    acceptAccounts(next);
    if (prevId !== next.active_app_id && switchHandlers?.afterSwitch) {
      await switchHandlers.afterSwitch();
    }
  });
}
