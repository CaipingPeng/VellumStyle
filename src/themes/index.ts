import {basic} from "./basic.ts";
import {defaultTheme} from "./markdown/default.ts";
import {elegant} from "./markdown/elegant.ts";
import {tech} from "./markdown/tech.ts";
import {atomOneDark} from "./code/atom-one-dark.ts";
import {github} from "./code/github.ts";

export interface ThemeOption {
  id: string;
  name: string;
  css: string;
  // 该主题搭配的代码块高亮 CSS，随主题一起切换。
  codeCss: string;
}

// 基础层：永远不变
export {basic};

export const markdownThemes: ThemeOption[] = [
  {id: "default", name: "默认主题", css: defaultTheme, codeCss: atomOneDark},
  {id: "elegant", name: "优雅杂志", css: elegant, codeCss: github},
  {id: "tech", name: "科技蓝", css: tech, codeCss: atomOneDark},
];

export const defaultMarkdownTheme = markdownThemes[0];

export function getMarkdownTheme(id: string): ThemeOption {
  return markdownThemes.find((t) => t.id === id) ?? defaultMarkdownTheme;
}

export function getMarkdownCss(id: string): string {
  return getMarkdownTheme(id).css;
}

export function getCodeCss(id: string): string {
  return getMarkdownTheme(id).codeCss;
}
