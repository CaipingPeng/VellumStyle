export const DEFAULT_SIDE_PANEL_WIDTH = 220;
export const MIN_SIDE_PANEL_WIDTH = 180;
export const MAX_SIDE_PANEL_WIDTH = 420;
export const SIDE_PANEL_WIDTH_STEP = 16;

export function resizeSidePanelWidth(
  startWidth: number,
  startX: number,
  currentX: number,
): number {
  const nextWidth = Math.round(startWidth + currentX - startX);
  return Math.min(MAX_SIDE_PANEL_WIDTH, Math.max(MIN_SIDE_PANEL_WIDTH, nextWidth));
}
