// 路径处理工具：文档树路径统一使用 "/" 分隔的相对路径，
// 但外部来源（文件选择器、历史配置）可能带 Windows 反斜杠，
// 取文件名时必须兼容两种分隔符，避免把整条路径当文件名。

/** 取路径最后一段（兼容 "/" 与 "\"）；空输入返回原值。 */
export function baseName(path: string): string {
  const base = path.split(/[\\/]/).filter(Boolean).pop();
  return base ?? path;
}

/** 取 Markdown 文档标题：文件名去目录、去 .md/.markdown 扩展名。 */
export function markdownTitle(path: string): string {
  return baseName(path).replace(/\.(md|markdown)$/i, "");
}
