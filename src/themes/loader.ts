import {invoke} from "@tauri-apps/api/core";
import {loadBuiltinThemes, type ThemeOption, type StyleModel} from "./index.ts";
import {compileModel} from "./compileModel.ts";
import {validateModel} from "./themeModel.ts";

// 启动：内置 model 主题 + 用户目录 *.json 扫描，编译出 css。
// 无 Tauri 环境（Web 调试）时 invoke 抛错，回退为仅内置。
export async function loadAllThemes(): Promise<ThemeOption[]> {
  const builtinThemes = await loadBuiltinThemes();
  const builtinIds = new Set(builtinThemes.map((t) => t.id));
  let user: ThemeOption[] = [];
  try {
    const raw = await invoke<{id: string; name: string; model: unknown}[]>("list_user_themes");
    user = raw
      .filter((u) => validateModel(u.model))
      .map((u) => {
        const model = u.model as StyleModel[];
        return {id: u.id, name: u.name || u.id, css: compileModel(model), model};
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

// 导入主题模型 JSON：raw 为整包字符串，id 为新主题名。
export async function importThemeModel(id: string, raw: string): Promise<void> {
  await invoke("import_theme_model", {id, rawJson: raw});
}

// 保存当前主题模型到用户主题目录；同 id 用户主题会在下次扫描时覆盖内置主题。
export async function saveUserTheme(id: string, modelJson: string): Promise<void> {
  await invoke("save_user_theme", {id, modelJson});
}
