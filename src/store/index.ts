import {create} from "zustand";
import {persist} from "zustand/middleware";
import {defaultMarkdownTheme} from "../themes/index.ts";

export interface EditorState {
  content: string;
  markdownThemeId: string;
  setContent: (content: string) => void;
  setMarkdownTheme: (id: string) => void;
}

export const useStore = create<EditorState>()(
  persist(
    (set) => ({
      content: "",
      markdownThemeId: defaultMarkdownTheme.id,
      setContent: (content) => set({content}),
      setMarkdownTheme: (markdownThemeId) => set({markdownThemeId}),
    }),
    {
      name: "wechat-md-editor",
      partialize: (s) => ({
        content: s.content,
        markdownThemeId: s.markdownThemeId,
      }),
    },
  ),
);
