const STYLE_LABELS: Record<string, string> = {
  fontSize: "字号",
  fontColor: "文字颜色",
  color: "颜色",
  backgroundColor: "背景颜色",
  borderColor: "边框颜色",
  lineHeight: "行高",
  letterSpacing: "字间距",
  fontWeight: "字重",
  textAlign: "对齐",
  marginPadding: "外边距 / 内边距",
  marginTop: "上边距",
  marginBottom: "下边距",
  marginLeft: "左边距",
  marginRight: "右边距",
  paddingTop: "上内边距",
  paddingBottom: "下内边距",
  paddingLeft: "左内边距",
  paddingRight: "右内边距",
  borderRadius: "圆角",
  borderWidth: "边框宽度",
  borderStyle: "边框样式",
  width: "宽度",
  maxWidth: "最大宽度",
  common: "高级 CSS",
};

export function getStyleLabel(styleId: string): string {
  return STYLE_LABELS[styleId] ?? styleId;
}
