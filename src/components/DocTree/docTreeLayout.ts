export const DEFAULT_DOC_TREE_WIDTH = 220;
export const MIN_DOC_TREE_WIDTH = 180;
export const MAX_DOC_TREE_WIDTH = 420;

export function resizeDocTreeWidth(
  startWidth: number,
  startX: number,
  currentX: number,
): number {
  const nextWidth = Math.round(startWidth + currentX - startX);
  return Math.min(MAX_DOC_TREE_WIDTH, Math.max(MIN_DOC_TREE_WIDTH, nextWidth));
}
