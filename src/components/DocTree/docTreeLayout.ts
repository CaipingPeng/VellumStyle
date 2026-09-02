import {
  DEFAULT_SIDE_PANEL_WIDTH,
  MAX_SIDE_PANEL_WIDTH,
  MIN_SIDE_PANEL_WIDTH,
  resizeSidePanelWidth,
} from "../Workspace/sidePanelLayout.ts";

export const DEFAULT_DOC_TREE_WIDTH = DEFAULT_SIDE_PANEL_WIDTH;
export const MIN_DOC_TREE_WIDTH = MIN_SIDE_PANEL_WIDTH;
export const MAX_DOC_TREE_WIDTH = MAX_SIDE_PANEL_WIDTH;

export function resizeDocTreeWidth(
  startWidth: number,
  startX: number,
  currentX: number,
): number {
  return resizeSidePanelWidth(startWidth, startX, currentX);
}
