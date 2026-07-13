export interface PreviewImageMenuTarget {
  source: string;
  x: number;
  y: number;
}

export function resolvePreviewImage(
  target: EventTarget | null,
  articleRoot: HTMLElement,
  overlayImage?: HTMLImageElement | null,
): HTMLImageElement | null {
  if (!(target instanceof Element)) return null;

  if (target.closest(".vs-image-resize-overlay")) {
    return overlayImage && articleRoot.contains(overlayImage) ? overlayImage : null;
  }

  const image = target.closest("img");
  return image && articleRoot.contains(image) ? (image as HTMLImageElement) : null;
}

export function clampMenuPosition(
  x: number,
  y: number,
  menuWidth: number,
  menuHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  gap = 8,
): {left: number; top: number} {
  const safeGap = Math.max(0, gap);
  const maxLeft = Math.max(safeGap, viewportWidth - menuWidth - safeGap);
  const maxTop = Math.max(safeGap, viewportHeight - menuHeight - safeGap);

  return {
    left: Math.min(Math.max(x, safeGap), maxLeft),
    top: Math.min(Math.max(y, safeGap), maxTop),
  };
}
