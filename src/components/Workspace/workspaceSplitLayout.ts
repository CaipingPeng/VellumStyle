export const DEFAULT_WORKSPACE_SPLIT_RATIO = 0.5;
export const MIN_PERSISTED_WORKSPACE_SPLIT_RATIO = 0.2;
export const MAX_PERSISTED_WORKSPACE_SPLIT_RATIO = 0.8;
export const MIN_WORKSPACE_PANE_WIDTH = 280;
export const WORKSPACE_SEPARATOR_WIDTH = 8;
export const WORKSPACE_KEYBOARD_STEP = 0.02;
export const WORKSPACE_KEYBOARD_LARGE_STEP = 0.1;

export interface WorkspaceRatioBounds {
  min: number;
  max: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function sanitizeWorkspaceSplitRatio(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < MIN_PERSISTED_WORKSPACE_SPLIT_RATIO ||
    value > MAX_PERSISTED_WORKSPACE_SPLIT_RATIO
  ) {
    return DEFAULT_WORKSPACE_SPLIT_RATIO;
  }
  return value;
}

export function getWorkspaceRatioBounds(containerWidth: number): WorkspaceRatioBounds {
  const paneWidth = Math.max(containerWidth - WORKSPACE_SEPARATOR_WIDTH, 0);
  if (paneWidth <= 0 || paneWidth < MIN_WORKSPACE_PANE_WIDTH * 2) {
    return {min: 0.5, max: 0.5};
  }
  const min = MIN_WORKSPACE_PANE_WIDTH / paneWidth;
  return {
    min: Math.max(MIN_PERSISTED_WORKSPACE_SPLIT_RATIO, min),
    max: Math.min(MAX_PERSISTED_WORKSPACE_SPLIT_RATIO, 1 - min),
  };
}

export function clampWorkspaceSplitRatio(ratio: unknown, containerWidth: number): number {
  const safeRatio = sanitizeWorkspaceSplitRatio(ratio);
  const bounds = getWorkspaceRatioBounds(containerWidth);
  return clamp(safeRatio, bounds.min, bounds.max);
}

export function getWorkspacePaneWidths(
  ratio: unknown,
  containerWidth: number,
): {editor: number; preview: number} {
  const distributable = Math.max(containerWidth - WORKSPACE_SEPARATOR_WIDTH, 0);
  const safeRatio = clampWorkspaceSplitRatio(ratio, containerWidth);
  const editor = Math.round(distributable * safeRatio);
  return {editor, preview: distributable - editor};
}

export function ratioFromPointer(
  clientX: number,
  containerLeft: number,
  containerWidth: number,
): number {
  const distributable = Math.max(containerWidth - WORKSPACE_SEPARATOR_WIDTH, 1);
  const bounds = getWorkspaceRatioBounds(containerWidth);
  return clamp((clientX - containerLeft) / distributable, bounds.min, bounds.max);
}

export function stepWorkspaceSplitRatio(
  ratio: number,
  key: string,
  containerWidth: number,
  largeStep: boolean,
): number | null {
  if (key === "Home") {
    return clampWorkspaceSplitRatio(DEFAULT_WORKSPACE_SPLIT_RATIO, containerWidth);
  }
  if (key !== "ArrowLeft" && key !== "ArrowRight") {
    return null;
  }
  const step = largeStep ? WORKSPACE_KEYBOARD_LARGE_STEP : WORKSPACE_KEYBOARD_STEP;
  const direction = key === "ArrowRight" ? 1 : -1;
  const bounds = getWorkspaceRatioBounds(containerWidth);
  const nextRatio = Math.round((ratio + direction * step) * 1_000_000) / 1_000_000;
  return clamp(nextRatio, bounds.min, bounds.max);
}
