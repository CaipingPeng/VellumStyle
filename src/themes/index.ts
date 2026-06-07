import {compileModel} from "./compileModel.ts";
import type {StyleModel} from "./themeModel.ts";
import defaultModel from "./default.json" with {type: "json"};

export type {StyleModel} from "./themeModel.ts";

export interface ThemeOption {
  id: string;
  name: string;
  css: string; // 由 model 编译产出（注入预览/复制）
  model: StyleModel[]; // 真相源，可进面板编辑
}

const DEFAULT_MODEL = defaultModel as StyleModel[];

export const builtinThemes: ThemeOption[] = [
  {id: "default", name: "default", css: compileModel(DEFAULT_MODEL), model: DEFAULT_MODEL},
];

export const defaultMarkdownTheme: ThemeOption = builtinThemes[0];
