export type PreviewModeId = "fluid" | "wechat" | "mobile";

export interface PreviewMode {
  id: PreviewModeId;
  label: string;
  width: number | null;
}

export const PREVIEW_MODES: PreviewMode[] = [
  {id: "fluid", label: "放开展示", width: null},
  {id: "wechat", label: "微信桌面端渲染", width: 677},
  {id: "mobile", label: "手机端渲染", width: 390},
];

export function getPreviewMode(id: PreviewModeId): PreviewMode {
  return PREVIEW_MODES.find((mode) => mode.id === id) ?? PREVIEW_MODES[0];
}
