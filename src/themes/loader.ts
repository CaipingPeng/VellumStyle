import {invoke} from "@tauri-apps/api/core";
import {loadBuiltinThemes, type ThemeOption} from "./index.ts";
import {scopeCssTo} from "../components/Theme/scopeCss.ts";
import {ARTICLE_ROOT_SELECTOR} from "../articleRoot.ts";

// 启动：内置 CSS 主题 + 用户目录 *.css 扫描，统一作用域到 #article。
// 无 Tauri 环境（Web 调试）时 invoke 抛错，回退为仅内置。
export async function loadAllThemes(): Promise<ThemeOption[]> {
  const builtinThemes = await loadBuiltinThemes();
  const builtinIds = new Set(builtinThemes.map((t) => t.id));
  let user: ThemeOption[] = [];
  try {
    const raw = await invoke<{id: string; name: string; css?: string}[]>("list_user_themes");
    user = raw.flatMap((u): ThemeOption[] => {
      const css = u.css ?? "";
      if (!css.trim()) return [];
      // 统一作用域到 #article：作者写裸选择器也不会污染应用 UI，
      // 预览/导出/缩略图共用同一份已作用域 CSS。
      return [{id: u.id, name: u.name || u.id, css: scopeCssTo(css, ARTICLE_ROOT_SELECTOR)}];
    });
  } catch {
    // 非 Tauri 环境，仅内置主题
  }
  const userById = new Map(user.map((theme) => [theme.id, theme]));
  const mergedBuiltins = builtinThemes.map((theme) => userById.get(theme.id) ?? theme);
  const customOnly = user.filter((theme) => !builtinIds.has(theme.id));
  return [...mergedBuiltins, ...customOnly];
}

// 在系统文件管理器打开用户主题目录。
export async function openThemesDir(): Promise<void> {
  await invoke("open_themes_dir");
}

// 导入 CSS 主题：raw 为 CSS 文本，id 为新主题名。
export async function importCssTheme(id: string, rawCss: string): Promise<void> {
  await invoke("import_css_theme", {id, rawCss});
}
