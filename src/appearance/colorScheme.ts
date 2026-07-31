export type ColorSchemeId = "violet" | "coral" | "mint" | "ocean";

export interface ColorSchemeOption {
  id: ColorSchemeId;
  label: string;
  description: string;
  /** 亮色底色，用于设置面板色卡预览 */
  background: string;
  /** 设置面板色卡预览用的渐变背景 */
  gradient: string;
}

export const COLOR_SCHEMES: ColorSchemeOption[] = [
  {
    id: "violet",
    label: "文澜紫",
    description: "默认 · 靛紫渐变",
    background: "#fbfaf7",
    gradient: "linear-gradient(135deg, #6d5ae6, #a855f7)",
  },
  {
    id: "coral",
    label: "珊瑚暖橙",
    description: "暖调 · 活力",
    background: "#fdf9f6",
    gradient: "linear-gradient(135deg, #f2565e, #ff9a62)",
  },
  {
    id: "mint",
    label: "薄荷青绿",
    description: "清新 · 自然",
    background: "#f6fbf8",
    gradient: "linear-gradient(135deg, #0fa78f, #3ecf8e)",
  },
  {
    id: "ocean",
    label: "海岸蓝",
    description: "冷静 · 专注",
    background: "#f5f8fc",
    gradient: "linear-gradient(135deg, #3b82f6, #6366f1)",
  },
];

export const DEFAULT_COLOR_SCHEME: ColorSchemeId = "violet";
/** 与外观模式共用同一个 Zustand 持久化键。 */
export const COLOR_SCHEME_STORAGE_KEY = "vellumstyle";

interface ColorSchemeStorage {
  getItem: (key: string) => string | null;
}

interface ColorSchemeRoot {
  setAttribute: (name: string, value: string) => void;
}

export function sanitizeColorScheme(value: unknown): ColorSchemeId {
  return COLOR_SCHEMES.some((scheme) => scheme.id === value)
    ? (value as ColorSchemeId)
    : DEFAULT_COLOR_SCHEME;
}

export function readPersistedColorScheme(
  storage?: ColorSchemeStorage | null,
): ColorSchemeId {
  if (!storage) return DEFAULT_COLOR_SCHEME;
  try {
    const raw = storage.getItem(COLOR_SCHEME_STORAGE_KEY);
    if (!raw) return DEFAULT_COLOR_SCHEME;
    const persisted = JSON.parse(raw) as {state?: {colorScheme?: unknown}};
    return sanitizeColorScheme(persisted?.state?.colorScheme);
  } catch {
    return DEFAULT_COLOR_SCHEME;
  }
}

export function applyColorScheme(
  scheme: ColorSchemeId,
  root?: ColorSchemeRoot | null,
): void {
  if (!root) return;
  root.setAttribute("data-scheme", sanitizeColorScheme(scheme));
}
