import {invoke} from "@tauri-apps/api/core";
import {isTauriRuntime} from "./tauriEnv.ts";

export type WechatFeature = "backend" | "api";
export interface CapabilityState {desktop: boolean; backend: boolean; configured: boolean}
export function capabilityReason(feature: WechatFeature, state: CapabilityState): string | null {
  if (!state.desktop) return "此功能需要桌面版。浏览器中可以继续编辑、预览和导出。";
  if (feature === "backend" && !state.backend) return "此微信后台功能仅支持 Windows 桌面版。可在微信后台操作后，将图片或链接插入文章。";
  if (feature === "api" && !state.configured) return "请先在设置中填写公众号 AppID 和 AppSecret，并配置 IP 白名单。";
  return null;
}
export async function readCapabilities(): Promise<CapabilityState> {
  if (!isTauriRuntime()) return {desktop: false, backend: false, configured: false};
  const [backend, config] = await Promise.all([
    invoke<boolean>("supports_wechat_backend"),
    invoke<{wechat: {app_id: string; app_secret: string}}>("get_config"),
  ]);
  return {desktop: true, backend, configured: Boolean(config.wechat.app_id && config.wechat.app_secret)};
}
