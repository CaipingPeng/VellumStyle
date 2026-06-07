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

// 预置主题（从 mdnice 收录）：presets/*.json 形态为 {name, model}，编译期内联进包。
// 文件名（去扩展名）作 id，name 字段作显示名。新增预置主题只需丢 .json 文件。
type PresetFile = {name?: string; model?: unknown};
const presetModules = import.meta.glob("./presets/*.json", {eager: true}) as Record<
  string,
  {default: PresetFile}
>;

const presetThemes: ThemeOption[] = Object.entries(presetModules)
  .map(([path, mod]) => {
    const id = path.replace(/^\.\/presets\//, "").replace(/\.json$/, "");
    const raw = mod.default;
    const model = raw?.model;
    if (!validateModel(model)) return null;
    return {
      id,
      name: raw.name || id,
      css: compileModel(model),
      model,
    } as ThemeOption;
  })
  .filter((t): t is ThemeOption => t !== null)
  .sort((a, b) => a.name.localeCompare(b.name, "zh"));

// default 永远排第一，其余预置主题跟在后面。
export const builtinThemes: ThemeOption[] = [defaultTheme, ...presetThemes];

export const defaultMarkdownTheme: ThemeOption = defaultTheme;
