export type AppearanceMode = "light" | "dark";

export const DEFAULT_APPEARANCE_MODE: AppearanceMode = "light";
export const APPEARANCE_STORAGE_KEY = "vellumstyle";

interface AppearanceStorage {
  getItem: (key: string) => string | null;
}

interface AppearanceRoot {
  style: {colorScheme: string};
  setAttribute: (name: string, value: string) => void;
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
  root.setAttribute("data-appearance", safeMode);
  root.style.colorScheme = safeMode;
}
