// 主题 style 标签的 id（与 index.html 中的 <style> 对应）。
// model 自包含全部主题样式，统一注入 markdown 层（旧的 basic/code/font 分层已废弃删除）。
export const STYLE_IDS = {
  markdown: "markdown-theme",
} as const;

// 替换指定 style 标签的内容，浏览器自动重渲染预览区。
export function replaceStyle(id: string, css: string) {
  const style = document.getElementById(id);
  if (style) {
    style.innerHTML = css;
  }
}
