const LAST_OUTBOUND_IP_KEY = "vellumstyle.wechat.lastOutboundIp";
const STARTUP_OUTBOUND_IP_CHECKED_KEY = "vellumstyle.wechat.startupOutboundIpChecked";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export type StartupOutboundIpCheckResult =
  | {status: "initialized"; currentIp: string}
  | {status: "unchanged"; currentIp: string}
  | {status: "changed"; previousIp: string; currentIp: string};

function normalizeOutboundIp(ip: string): string {
  return ip.trim();
}

function safeGet(storage: StorageLike, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(storage: StorageLike, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    // Storage failures should not block manual IP lookup or app startup.
  }
}

export function rememberOutboundIp(ip: string, storage: StorageLike = window.localStorage): void {
  const currentIp = normalizeOutboundIp(ip);
  if (!currentIp) return;
  safeSet(storage, LAST_OUTBOUND_IP_KEY, currentIp);
}

export async function checkStartupOutboundIp(
  fetchOutboundIp: () => Promise<string>,
  storage: StorageLike = window.localStorage,
): Promise<StartupOutboundIpCheckResult> {
  const previousIp = normalizeOutboundIp(safeGet(storage, LAST_OUTBOUND_IP_KEY) ?? "");
  const currentIp = normalizeOutboundIp(await fetchOutboundIp());

  rememberOutboundIp(currentIp, storage);

  if (!previousIp) {
    return {status: "initialized", currentIp};
  }

  if (previousIp === currentIp) {
    return {status: "unchanged", currentIp};
  }

  return {status: "changed", previousIp, currentIp};
}

export function shouldRunStartupOutboundIpCheck(storage: StorageLike = window.sessionStorage): boolean {
  if (safeGet(storage, STARTUP_OUTBOUND_IP_CHECKED_KEY) === "1") {
    return false;
  }
  safeSet(storage, STARTUP_OUTBOUND_IP_CHECKED_KEY, "1");
  return true;
}

export function formatOutboundIpChangedMessage(previousIp: string, currentIp: string): string {
  return `检测到当前出口 IP 已从 ${previousIp} 变为 ${currentIp}。\n\n请前往微信公众平台「设置与开发 → 基本配置 → IP 白名单」更换白名单 IP。`;
}
