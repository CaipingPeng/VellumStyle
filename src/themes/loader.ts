import {invoke} from "@tauri-apps/api/core";
import {builtinThemes, type ThemeOption} from "./index.ts";

// 启动时调用：内置主题（编译进包）+ 用户目录扫描结果合并。
// 同名时用户主题被过滤，内置主题不可被覆盖/删除。
// 无 Tauri 环境（Web 调试）时 invoke 抛错，回退为仅内置。
export async function loadAllThemes(): Promise<ThemeOption[]> {
  let user: ThemeOption[] = [];
  try {
    const raw = await invoke<{id: string; css: string}[]>("list_user_themes");
    const builtinIds = new Set(builtinThemes.map((t) => t.id));
    user = raw
      .filter((u) => !builtinIds.has(u.id))
      .map((u) => ({id: u.id, name: u.id, css: u.css}));
  } catch {
    // 非 Tauri 环境，仅内置主题
  }
  return [...builtinThemes, ...user];
}

// 在系统文件管理器打开用户主题目录（用户往里丢 .css 即新增主题）。
export async function openThemesDir(): Promise<void> {
  await invoke("open_themes_dir");
}
