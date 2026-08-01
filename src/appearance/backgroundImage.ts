import {convertFileSrc} from "@tauri-apps/api/core";
import {isTauriRuntime} from "../utils/tauriEnv.ts";

/** 背景模糊默认值（px）：0 最清晰，越大越接近毛玻璃。 */
export const DEFAULT_BACKGROUND_BLUR = 10;
/** 背景模糊最大值（px），避免背景完全不可辨认。 */
export const MAX_BACKGROUND_BLUR = 30;
/** 状态栏不透明度默认值：0 完全透明，1 完全不透明。 */
export const DEFAULT_STATUS_BAR_OPACITY = 0.7;
/** 与外观/配色共用同一个 Zustand 持久化键。 */
export const BACKGROUND_IMAGE_STORAGE_KEY = "vellumstyle";

export interface BackgroundImageSettings {
  path: string | null;
  blur: number;
}

interface BackgroundStorage {
  getItem: (key: string) => string | null;
}

interface BackgroundRoot {
  style: {setProperty: (name: string, value: string) => void};
  classList?: {toggle: (name: string, force?: boolean) => void};
}

export function sanitizeBackgroundImagePath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function sanitizeBackgroundBlur(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_BACKGROUND_BLUR;
  }
  return Math.min(MAX_BACKGROUND_BLUR, Math.max(0, value));
}

export function sanitizeStatusBarOpacity(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_STATUS_BAR_OPACITY;
  }
  return Math.min(1, Math.max(0, value));
}

export function readPersistedBackgroundImage(
  storage?: BackgroundStorage | null,
): BackgroundImageSettings {
  if (!storage) return {path: null, blur: DEFAULT_BACKGROUND_BLUR};
  try {
    const raw = storage.getItem(BACKGROUND_IMAGE_STORAGE_KEY);
    if (!raw) return {path: null, blur: DEFAULT_BACKGROUND_BLUR};
    const persisted = JSON.parse(raw) as {
      state?: {backgroundImagePath?: unknown; backgroundBlur?: unknown};
    };
    return {
      path: sanitizeBackgroundImagePath(persisted?.state?.backgroundImagePath),
      blur: sanitizeBackgroundBlur(persisted?.state?.backgroundBlur),
    };
  } catch {
    return {path: null, blur: DEFAULT_BACKGROUND_BLUR};
  }
}

/**
 * 把背景图应用到根元素 CSS 变量。
 * - --app-bg-image：无图或非 Tauri 环境为 none
 * - --app-bg-blur：毛玻璃模糊半径，无图时强制为 0
 * - has-app-bg：有生效背景图时挂到 <html>，供工作区透明化
 */
export function applyBackgroundImage(
  path: string | null,
  blur: number,
  root?: BackgroundRoot | null,
): void {
  if (!root) return;
  const safePath = sanitizeBackgroundImagePath(path);
  const safeBlur = sanitizeBackgroundBlur(blur);
  const image = safePath && isTauriRuntime()
    ? `url("${convertFileSrc(safePath).replace(/"/g, '\\"')}")`
    : "none";
  const hasImage = image !== "none";
  root.style.setProperty("--app-bg-image", image);
  // 图片未生效时模糊强制为 0，避免对纯色底产生多余的滤镜开销
  root.style.setProperty("--app-bg-blur", `${hasImage ? safeBlur : 0}px`);
  root.classList?.toggle("has-app-bg", hasImage);
}
