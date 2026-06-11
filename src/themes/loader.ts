import {invoke} from "@tauri-apps/api/core";
import {loadBuiltinThemes, type ThemeOption, type StyleModel} from "./index.ts";
import {compileModel} from "./compileModel.ts";
import {validateModel} from "./themeModel.ts";

// 启动：内置 model 主题 + 用户目录 *.json 扫描，编译出 css。
// 无 Tauri 环境（Web 调试）时 invoke 抛错，回退为仅内置。
export async function loadAllThemes(): Promise<ThemeOption[]> {
  const builtinThemes = await loadBuiltinThemes();
  let user: ThemeOption[] = [];
  try {
    const raw = await invoke<{id: string; name: string; model: unknown}[]>("list_user_themes");
    const builtinIds = new Set(builtinThemes.map((t) => t.id));
    user = raw
      .filter((u) => !builtinIds.has(u.id) && validateModel(u.model))
      .map((u) => {
        const model = u.model as StyleModel[];
        return {id: u.id, name: u.name || u.id, css: compileModel(model), model};
      });
  } catch {
    // 非 Tauri 环境，仅内置主题
  }
  return [...builtinThemes, ...user];
}

// 在系统文件管理器打开用户主题目录。
export async function openThemesDir(): Promise<void> {
  await invoke("open_themes_dir");
}

// 导入 mdnice 抓包 JSON：raw 为整包字符串，id 为新主题名。
export async function importMdniceTheme(id: string, raw: string): Promise<void> {
  await invoke("import_mdnice_theme", {id, rawJson: raw});
}
