interface VisibleActionOptions {
  availableWidth: number;
  secondaryWidths: number[];
  primaryWidths: number[];
  moreWidth: number;
  gap?: number;
}

interface AvailableWidthOptions {
  headerWidth: number;
  paddingLeft: number;
  paddingRight: number;
  gap: number;
  leftMinWidth: number;
}

export function computeToolbarAvailableWidth({
  headerWidth,
  paddingLeft,
  paddingRight,
  gap,
  leftMinWidth,
}: AvailableWidthOptions): number {
  return Math.max(0, headerWidth - paddingLeft - paddingRight - gap - leftMinWidth);
}

export function computeVisibleActionCount({
  availableWidth,
  secondaryWidths,
  primaryWidths,
  moreWidth,
  gap = 8,
}: VisibleActionOptions): number {
  for (let count = secondaryWidths.length; count >= 0; count -= 1) {
    const hidden = secondaryWidths.length - count;
    const widths = [
      ...secondaryWidths.slice(0, count),
      ...primaryWidths,
      ...(hidden > 0 ? [moreWidth] : []),
    ];
    const total = widths.reduce((sum, width) => sum + width, 0) + Math.max(0, widths.length - 1) * gap;
    if (total <= availableWidth + 0.5 || count === 0) {
      return count;
    }
  }
  return 0;
}
