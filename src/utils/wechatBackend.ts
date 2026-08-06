import {
  backendWindowUrl,
  openWechatBackendHidden,
  showWechatBackend,
} from "./publish.ts";
import {toast} from "../components/Toast/toast.ts";

export interface BackendReadyOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
}

function backendErrorMessage(error: unknown): string {
  return typeof error === "string" ? error : (error as Error)?.message || "未知错误";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/// 在后台窗口就绪后执行命令：窗口未打开时静默创建隐藏窗口，等待页面导航到微信域，
/// 命令返回结果未就绪（如未登录错误）时显示窗口等待登录，超时抛错。
export async function waitBackendCommand<T>(
  run: () => Promise<T>,
  isReady: (result: T) => boolean,
  options: BackendReadyOptions = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 60_000;
  const pollIntervalMs = options.pollIntervalMs ?? 1500;
  const startedAt = Date.now();
  let windowOpen = false;
  let shown = false;
  const deadline = () => Date.now() - startedAt > timeoutMs;

  const ensureWindow = async () => {
    if (!windowOpen) {
      windowOpen = true;
      await openWechatBackendHidden();
      toast.show("正在等待微信后台就绪…", "info", 3000);
    }
    // 先等隐藏窗口导航到微信域（页面基本加载完成），避免未就绪时误判为未登录
    while (!deadline()) {
      let url: string | null = null;
      try {
        url = await backendWindowUrl();
      } catch {
        // 窗口暂不可读，继续等待
      }
      if (url?.startsWith("https://mp.weixin.qq.com/")) return;
      await delay(pollIntervalMs);
    }
    throw new Error("等待微信后台就绪超时");
  };

  for (;;) {
    if (deadline()) {
      throw new Error("等待微信后台登录超时，请登录后重新尝试");
    }
    try {
      const result = await run();
      if (isReady(result)) return result;
      // 有返回但未就绪（如未登录的错误 JSON）：打开并显示窗口等待登录
      await ensureWindow();
      if (!shown) {
        shown = true;
        await showWechatBackend();
      }
      await delay(pollIntervalMs);
    } catch (error) {
      const message = backendErrorMessage(error);
      if (message.includes("WECHAT_BACKEND_NOT_OPENED")) {
        await ensureWindow();
        await delay(pollIntervalMs);
        continue;
      }
      throw error;
    }
  }
}
