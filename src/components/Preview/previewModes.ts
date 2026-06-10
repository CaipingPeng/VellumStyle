export type PreviewModeId = "fluid" | "wechat" | "mobile";

export interface PreviewMode {
  id: PreviewModeId;
  label: string;
  width: number | null;
}

export const PREVIEW_MODES: PreviewMode[] = [
  {id: "fluid", label: "适应窗口", width: null},
  {id: "wechat", label: "微信宽度", width: 677},
  {id: "mobile", label: "移动预览", width: 390},
];

export function getPreviewMode(id: PreviewModeId): PreviewMode {
  return PREVIEW_MODES.find((mode) => mode.id === id) ?? PREVIEW_MODES[0];
}
