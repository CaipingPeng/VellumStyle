import {create} from "zustand";
import {persist} from "zustand/middleware";
import {builtinThemes, defaultMarkdownTheme, type ThemeOption} from "../themes/index.ts";

export interface EditorState {
  content: string;
  markdownThemeId: string;
  themes: ThemeOption[];
  setContent: (content: string) => void;
  setMarkdownTheme: (id: string) => void;
  setThemes: (themes: ThemeOption[]) => void;
}

export const useStore = create<EditorState>()(
  persist(
    (set) => ({
      content: "",
      markdownThemeId: defaultMarkdownTheme.id,
      // 初始为内置主题；启动后 loadAllThemes() 合并用户主题覆盖
      themes: builtinThemes,
      setContent: (content) => set({content}),
      setMarkdownTheme: (markdownThemeId) => set({markdownThemeId}),
      setThemes: (themes) => set({themes}),
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
