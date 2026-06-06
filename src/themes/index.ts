import {basic} from "./basic.ts";

export interface ThemeOption {
  id: string; // 文件名（不含扩展名），如 "elegant"
  name: string; // 展示名，当前 = id（文件名即主题名）
  css: string; // 自包含：markdown 样式 + 代码高亮样式
}

// 基础层：永远不变，单独注入
export {basic};

// 编译期扫描 ./markdown/*.css，把内置主题 CSS 内联进包。新增内置主题只需丢 .css 文件。
const modules = import.meta.glob("./markdown/*.css", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export const builtinThemes: ThemeOption[] = Object.entries(modules)
  .map(([path, css]) => {
    const id = path.replace(/^\.\/markdown\//, "").replace(/\.css$/, "");
    return {id, name: id, css};
  })
  .sort((a, b) => a.id.localeCompare(b.id));

export const defaultMarkdownTheme: ThemeOption =
  builtinThemes.find((t) => t.id === "default") ?? builtinThemes[0];
