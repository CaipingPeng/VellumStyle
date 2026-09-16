import {clampMenuPosition} from "./previewImageContextMenu.ts";

export interface PanelRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PanelSize {
  width: number;
  height: number;
}

/** 面板与锚点元素之间的间距 */
export const FONT_PANEL_GAP = 10;

/**
 * 把「被点中的元素矩形」换算成面板的 fixed 坐标：
 * 默认贴在元素下方，下方空间不够时翻到上方，最后统一收进视口内。
 */
export function panelPositionForRect(
  rect: PanelRect,
  size: PanelSize,
  viewportWidth: number,
  viewportHeight: number,
): {left: number; top: number} {
  const below = rect.top + rect.height + FONT_PANEL_GAP;
  const above = rect.top - size.height - FONT_PANEL_GAP;
  const fitsBelow = below + size.height <= viewportHeight - FONT_PANEL_GAP;
  const preferredTop = fitsBelow ? below : above;

  return clampMenuPosition(
    rect.left,
    preferredTop,
    size.width,
    size.height,
    viewportWidth,
    viewportHeight,
    FONT_PANEL_GAP,
  );
}

/** 步进倍率相关的纯函数在 themes/typography.ts（面板与主题弹窗共用），这里只管定位。 */

/** 元素矩形（含预览滚动偏移）转成视口坐标。 */
export function viewportRectOf(element: Element): PanelRect {
  const rect = element.getBoundingClientRect();
  return {left: rect.left, top: rect.top, width: rect.width, height: rect.height};
}
