import inkHazeCss from "./builtin/ink-haze.css?raw";
import {scopeCssTo} from "../components/Theme/scopeCss.ts";
import {ARTICLE_ROOT_SELECTOR} from "../articleRoot.ts";

export interface ThemeOption {
  id: string;
  name: string;
  css: string; // 主题 CSS（已作用域到 #article，注入预览/复制）
  source: "builtin" | "user"; // 内置 / 用户主题（用户主题可删除）
}

// 内置主题：builtin/*.css 文件，文件名（去扩展名）作 id；
// 显示名在下方映射表中维护（文件系统文件名不一定适合直接展示）。
const BUILTIN_NAMES: Record<string, string> = {
  default: "默认",
  "ink-haze": "墨岚",
  "ink-haze-night": "墨岚·星空",
  happysimple: "清欢",
  "morandi-garden": "雾屿",
  "notion-style-light-enhanced": "纸间",
  "see-yue": "望月",
  "mdnice-1": "暮橙",
  "mdnice-3": "紫陌",
  "mdnice-6": "绯云",
  "mdnice-10": "青岚",
  "mdnice-16": "碧涧",
  "mdnice-17": "沧蓝",
  "mdnice-44": "玄墨",
  "mdnice-62": "素简",
};

// 默认主题：墨岚（VellumStyle 第一款自研主题，暖纸书卷 + 黛蓝/赭金）。
const defaultTheme: ThemeOption = {
  id: "ink-haze",
  name: BUILTIN_NAMES["ink-haze"],
  css: scopeCssTo(inkHazeCss, ARTICLE_ROOT_SELECTOR),
  source: "builtin",
};

const builtinModules = import.meta.glob("./builtin/*.css", {query: "?raw", import: "default"}) as Record<
  string,
  () => Promise<string>
>;

let builtinThemesPromise: Promise<ThemeOption[]> | undefined;

function toBuiltinTheme(path: string, css: string): ThemeOption | null {
  const id = path.replace(/^\.\/builtin\//, "").replace(/\.css$/, "");
  // default.css 与 ink-haze.css 已由 defaultTheme 单独加载，避免列表重复。
  if (id === "default" || id === "ink-haze") return null;
  if (!css.trim()) return null;
  return {
    id,
    name: BUILTIN_NAMES[id] ?? id,
    css: scopeCssTo(css, ARTICLE_ROOT_SELECTOR),
    source: "builtin",
  };
}

export async function loadBuiltinThemes(): Promise<ThemeOption[]> {
  if (!builtinThemesPromise) {
    builtinThemesPromise = Promise.all(
      Object.entries(builtinModules).map(async ([path, load]) => toBuiltinTheme(path, await load())),
    ).then((themes) => [
      defaultTheme,
      ...themes.filter((t): t is ThemeOption => t !== null).sort((a, b) => a.name.localeCompare(b.name, "zh")),
    ]);
  }
  return builtinThemesPromise;
}

// 启动首帧只需要默认主题；完整内置主题由 loadBuiltinThemes() 异步加载。
export const builtinThemes: ThemeOption[] = [defaultTheme];

export const defaultMarkdownTheme: ThemeOption = defaultTheme;
