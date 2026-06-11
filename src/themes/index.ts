import {compileModel} from "./compileModel.ts";
import type {StyleModel} from "./themeModel.ts";
import {validateModel} from "./themeModel.ts";
import defaultModel from "./default.json" with {type: "json"};

export type {StyleModel} from "./themeModel.ts";

export interface ThemeOption {
  id: string;
  name: string;
  css: string; // 由 model 编译产出（注入预览/复制）
  model: StyleModel[]; // 真相源，可进面板编辑
}

const DEFAULT_MODEL = defaultModel as StyleModel[];

const defaultTheme: ThemeOption = {
  id: "default",
  name: "默认",
  css: compileModel(DEFAULT_MODEL),
  model: DEFAULT_MODEL,
};

// 预置主题（从 mdnice 收录）：presets/*.json 形态为 {name, model}。
// 文件名（去扩展名）作 id，name 字段作显示名。新增预置主题只需丢 .json 文件。
type PresetFile = {name?: string; model?: unknown};
const presetModules = import.meta.glob("./presets/*.json", {import: "default"}) as Record<
  string,
  () => Promise<PresetFile>
>;

let builtinThemesPromise: Promise<ThemeOption[]> | undefined;

function toPresetTheme(path: string, raw: PresetFile): ThemeOption | null {
  const id = path.replace(/^\.\/presets\//, "").replace(/\.json$/, "");
  const model = raw?.model;
  if (!validateModel(model)) return null;
  return {
    id,
    name: raw.name || id,
    css: compileModel(model),
    model,
  };
}

export async function loadBuiltinThemes(): Promise<ThemeOption[]> {
  if (!builtinThemesPromise) {
    builtinThemesPromise = Promise.all(
      Object.entries(presetModules).map(async ([path, load]) => toPresetTheme(path, await load())),
    ).then((themes) => [
      defaultTheme,
      ...themes.filter((t): t is ThemeOption => t !== null).sort((a, b) => a.name.localeCompare(b.name, "zh")),
    ]);
  }
  return builtinThemesPromise;
}

// 启动首帧只需要默认主题；完整预设由 loadBuiltinThemes() 异步加载。
export const builtinThemes: ThemeOption[] = [defaultTheme];

export const defaultMarkdownTheme: ThemeOption = defaultTheme;
