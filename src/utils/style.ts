// 四层 style 标签的 id（与 index.html 中的 <style> 对应）
export const STYLE_IDS = {
  basic: "basic-theme",
  markdown: "markdown-theme",
  code: "code-theme",
  font: "font-theme",
} as const;

// 替换指定 style 标签的内容，浏览器自动重渲染预览区。
export function replaceStyle(id: string, css: string) {
  const style = document.getElementById(id);
  if (style) {
    style.innerHTML = css;
  }
}
