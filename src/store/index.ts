import {create} from "zustand";
import {persist} from "zustand/middleware";
import {compileModel} from "../themes/compileModel.ts";
import {builtinThemes, defaultMarkdownTheme, type ThemeOption, type StyleModel} from "../themes/index.ts";
import type {StyleItem} from "../themes/themeModel.ts";

export interface EditorState {
  content: string;
  markdownThemeId: string;
  themes: ThemeOption[];
  selectedModelId: string | null; // 当前面板编辑的元素 model id
  setContent: (content: string) => void;
  setMarkdownTheme: (id: string) => void;
  setThemes: (themes: ThemeOption[]) => void;
  setSelectedModel: (modelId: string | null) => void;
  // 改当前主题某个 style 项的值（按 model id + style 路径），重编译 css
  updateStyleValue: (modelId: string, stylePath: string[], value: string) => void;
}

function recompile(theme: ThemeOption): ThemeOption {
  return {...theme, css: compileModel(theme.model)};
}

// 按 style.id 路径（顶层或 children）定位并改值，返回新数组（不可变更新）
function setValueByPath(styles: StyleItem[], path: string[], value: string): StyleItem[] {
  const [head, ...rest] = path;
  return styles.map((item) => {
    if (item.id !== head) return item;
    if (rest.length === 0) return {...item, value};
    return {...item, children: item.children ? setValueByPath(item.children, rest, value) : item.children};
  });
}

export const useStore = create<EditorState>()(
  persist(
    (set) => ({
      content: "",
      markdownThemeId: defaultMarkdownTheme.id,
      // 初始为内置主题；启动后 loadAllThemes() 合并用户主题覆盖
      themes: builtinThemes,
      selectedModelId: null,
      setContent: (content) => set({content}),
      setMarkdownTheme: (markdownThemeId) => set({markdownThemeId}),
      setThemes: (themes) => set({themes}),
      setSelectedModel: (selectedModelId) => set({selectedModelId}),
      updateStyleValue: (modelId, stylePath, value) =>
        set((s) => ({
          themes: s.themes.map((t) => {
            if (t.id !== s.markdownThemeId) return t;
            const model = t.model.map((m) => {
              if (m.id !== modelId) return m;
              return {...m, styles: setValueByPath(m.styles, stylePath, value)};
            });
            return recompile({...t, model});
          }),
        })),
    }),
    {
      name: "wechat-md-editor",
      // themes 是运行期扫描结果，不持久化
      partialize: (s) => ({
        content: s.content,
        markdownThemeId: s.markdownThemeId,
      }),
    },
  ),
);

// 按 id 取当前主题（含用户主题），找不到回退默认。
export function getThemeById(themes: ThemeOption[], id: string): ThemeOption {
  return themes.find((t) => t.id === id) ?? defaultMarkdownTheme;
}

export type {StyleModel};
