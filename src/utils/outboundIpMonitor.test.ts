import {test} from "node:test";
import assert from "node:assert/strict";
import {
  checkStartupOutboundIp,
  formatOutboundIpChangedMessage,
  rememberOutboundIp,
  shouldRunStartupOutboundIpCheck,
} from "./outboundIpMonitor.ts";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

test("首次自动获取只记录当前出口 IP，不提醒白名单变更", async () => {
  const storage = new MemoryStorage();

  const result = await checkStartupOutboundIp(() => Promise.resolve("198.51.100.10"), storage);

  assert.deepEqual(result, {status: "initialized", currentIp: "198.51.100.10"});
});

test("出口 IP 未变化时不提醒", async () => {
  const storage = new MemoryStorage();
  rememberOutboundIp("198.51.100.10", storage);

  const result = await checkStartupOutboundIp(() => Promise.resolve("198.51.100.10"), storage);

  assert.deepEqual(result, {status: "unchanged", currentIp: "198.51.100.10"});
});

test("出口 IP 变化时返回新旧 IP 并更新记录", async () => {
  const storage = new MemoryStorage();
  rememberOutboundIp("198.51.100.10", storage);

  const result = await checkStartupOutboundIp(() => Promise.resolve("203.0.113.20"), storage);

  assert.deepEqual(result, {
    status: "changed",
    previousIp: "198.51.100.10",
    currentIp: "203.0.113.20",
  });
  assert.deepEqual(await checkStartupOutboundIp(() => Promise.resolve("203.0.113.20"), storage), {
    status: "unchanged",
    currentIp: "203.0.113.20",
  });
});

test("本次窗口会话只执行一次启动自动检查", () => {
  const session = new MemoryStorage();

  assert.equal(shouldRunStartupOutboundIpCheck(session), true);
  assert.equal(shouldRunStartupOutboundIpCheck(session), false);
});

test("白名单提醒文案包含新旧出口 IP", () => {
  assert.equal(
    formatOutboundIpChangedMessage("198.51.100.10", "203.0.113.20"),
    "检测到当前出口 IP 已从 198.51.100.10 变为 203.0.113.20。\n\n请前往微信公众平台「微信开发者平台 → 登录并点击右上角头像 → 账号管理 → 公众号 → 前往公众号详情页 → 基础信息 → IP 白名单」更换白名单 IP。",
  );
});
