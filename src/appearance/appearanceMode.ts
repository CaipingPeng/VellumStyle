export type AppearanceMode = "light" | "dark";

export const DEFAULT_APPEARANCE_MODE: AppearanceMode = "light";
export const APPEARANCE_STORAGE_KEY = "vellumstyle";
/** 亮暗切换过渡窗口：切换瞬间给根元素加临时类，过渡结束后移除。 */
export const APPEARANCE_TRANSITION_MS = 420;

let appearanceSwitchTimer: number | undefined;

interface AppearanceStorage {
  getItem: (key: string) => string | null;
}

interface AppearanceRoot {
  style: {colorScheme: string};
  setAttribute: (name: string, value: string) => void;
  getAttribute?: (name: string) => string | null;
  classList?: {add: (token: string) => void; remove: (token: string) => void};
}

export function sanitizeAppearanceMode(value: unknown): AppearanceMode {
  return value === "dark" || value === "light" ? value : DEFAULT_APPEARANCE_MODE;
}

export function readPersistedAppearanceMode(storage?: AppearanceStorage | null): AppearanceMode {
  if (!storage) return DEFAULT_APPEARANCE_MODE;
  try {
    const raw = storage.getItem(APPEARANCE_STORAGE_KEY);
    if (!raw) return DEFAULT_APPEARANCE_MODE;
    const persisted = JSON.parse(raw) as {state?: {appearanceMode?: unknown}};
    return sanitizeAppearanceMode(persisted?.state?.appearanceMode);
  } catch {
    return DEFAULT_APPEARANCE_MODE;
  }
}

export function applyAppearanceMode(mode: AppearanceMode, root?: AppearanceRoot | null): void {
  if (!root) return;
  const safeMode = sanitizeAppearanceMode(mode);
  if (root.classList && root.getAttribute?.("data-appearance") !== safeMode) {
    root.classList.add("appearance-switching");
    if (appearanceSwitchTimer) {
      window.clearTimeout(appearanceSwitchTimer);
    }
    appearanceSwitchTimer = window.setTimeout(() => {
      root.classList?.remove("appearance-switching");
      appearanceSwitchTimer = undefined;
    }, APPEARANCE_TRANSITION_MS);
  }
  root.setAttribute("data-appearance", safeMode);
  root.style.colorScheme = safeMode;
}
