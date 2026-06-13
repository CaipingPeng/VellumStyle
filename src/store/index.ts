import {create} from "zustand";
import {persist} from "zustand/middleware";
import {compileModel} from "../themes/compileModel.ts";
import {builtinThemes, defaultMarkdownTheme, type ThemeOption, type StyleModel} from "../themes/index.ts";
import type {StyleItem} from "../themes/themeModel.ts";
import {listDocuments, readDocument, writeDocument, type DocNode} from "../utils/documents.ts";
import {createDebouncedSaver} from "../utils/autosave.ts";
import {toast} from "../components/Toast/toast.ts";
import type {PreviewModeId} from "../components/Preview/previewModes.ts";
import {DEFAULT_CODE_THEME_ID, DEFAULT_PINNED_CODE_THEME_IDS, type CodeThemeId} from "../markdown/codeThemes.ts";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface EditorState {
  content: string;
  markdownThemeId: string;
  codeThemeId: CodeThemeId;
  themes: ThemeOption[];
  selectedModelId: string | null; // 当前面板编辑的元素 model id
  tree: DocNode[]; // 整棵文档树（运行期，不 persist）
  currentDocPath: string | null; // 当前在编辑器打开的文档，persist（记住上次打开）
  selectedPath: string | null; // 树里当前高亮项（文件或文件夹），统一选中源，运行期不 persist
  sidebarOpen: boolean; // 文档侧栏显隐，运行期不 persist，默认隐藏
  outlineOpen: boolean; // 当前文档大纲侧栏显隐，运行期不 persist，默认隐藏
  saveStatus: SaveStatus; // 当前文档保存状态
  lastSavedAt: number | null; // 最近一次保存成功时间戳
  previewMode: PreviewModeId; // 预览宽度模式
  favoriteThemeIds: string[]; // 收藏主题，persist
  pinnedCodeThemeIds: CodeThemeId[]; // 置顶代码主题，persist
  setContent: (content: string) => void;
  setMarkdownTheme: (id: string) => void;
  setCodeTheme: (id: CodeThemeId) => void;
  setThemes: (themes: ThemeOption[]) => void;
  setSelectedModel: (modelId: string | null) => void;
  setCurrentDocPath: (path: string | null) => void;
  setSelectedPath: (path: string | null) => void;
  setPreviewMode: (mode: PreviewModeId) => void;
  toggleFavoriteTheme: (id: string) => void;
  togglePinnedCodeTheme: (id: CodeThemeId) => void;
  toggleSidebar: () => void;
  toggleOutline: () => void;
  loadTree: () => Promise<void>;
  openDocument: (path: string) => Promise<void>;
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

const AUTOSAVE_DELAY_MS = 1200;

// 自动保存器：写当前文档到磁盘。debounce 后串行保存；切换/关窗前调 flushSave。
// 声明在 useStore 之前——回调延迟执行（debounce 到点才跑），届时 useStore 已就绪。
const saver = createDebouncedSaver(async (text) => {
  const path = useStore.getState().currentDocPath;
  if (path) await writeDocument(path, text);
}, AUTOSAVE_DELAY_MS, {
  onFlushStart: () => {
    useStore.setState({saveStatus: "saving"});
  },
  onFlushSuccess: (text) => {
    const state = useStore.getState();
    if (state.content === text) {
      useStore.setState({saveStatus: "saved", lastSavedAt: Date.now()});
    } else {
      useStore.setState({saveStatus: "idle"});
    }
  },
  onFlushError: (error) => {
    console.error("自动保存失败：", error);
    useStore.setState({saveStatus: "error"});
    if (typeof window !== "undefined") {
      toast.show("自动保存失败，请检查磁盘权限或稍后重试。", "error");
    }
  },
});

export function scheduleSave(text: string) {
  saver.schedule(text);
}

export function flushSave(): Promise<void> {
  return saver.flushNow();
}

export const useStore = create<EditorState>()(
  persist(
    (set) => ({
      content: "",
      markdownThemeId: defaultMarkdownTheme.id,
      codeThemeId: DEFAULT_CODE_THEME_ID,
      // 初始为内置主题；启动后 loadAllThemes() 合并用户主题覆盖
      themes: builtinThemes,
      selectedModelId: null,
      tree: [],
      currentDocPath: null,
      selectedPath: null,
      sidebarOpen: false,
      outlineOpen: false,
      saveStatus: "idle",
      lastSavedAt: null,
      previewMode: "fluid",
      favoriteThemeIds: [],
      pinnedCodeThemeIds: [...DEFAULT_PINNED_CODE_THEME_IDS],
      setContent: (content) => {
        set({content, saveStatus: "idle"});
        scheduleSave(content);
      },
      setMarkdownTheme: (markdownThemeId) => set({markdownThemeId}),
      setCodeTheme: (codeThemeId) => set({codeThemeId}),
      setThemes: (themes) => set({themes}),
      setSelectedModel: (selectedModelId) => set({selectedModelId}),
      setCurrentDocPath: (currentDocPath) => set({currentDocPath}),
      setSelectedPath: (selectedPath) => set({selectedPath}),
      setPreviewMode: (previewMode) => set({previewMode}),
      toggleFavoriteTheme: (id) =>
        set((s) => ({
          favoriteThemeIds: s.favoriteThemeIds.includes(id)
            ? s.favoriteThemeIds.filter((themeId) => themeId !== id)
            : [...s.favoriteThemeIds, id],
        })),
      togglePinnedCodeTheme: (id) =>
        set((s) => ({
          pinnedCodeThemeIds: s.pinnedCodeThemeIds.includes(id)
            ? s.pinnedCodeThemeIds.filter((themeId) => themeId !== id)
            : [...s.pinnedCodeThemeIds, id],
        })),
      toggleSidebar: () => set((s) => ({sidebarOpen: !s.sidebarOpen})),
      toggleOutline: () => set((s) => ({outlineOpen: !s.outlineOpen})),
      loadTree: async () => {
        const tree = await listDocuments();
        set({tree});
      },
      openDocument: async (path) => {
        // 先把当前篇落盘（必须 await，否则旧文档未保存编辑会丢）。
        await flushSave();
        const text = await readDocument(path);
        set({currentDocPath: path, selectedPath: path, content: text, selectedModelId: null, saveStatus: "saved", lastSavedAt: Date.now()});
      },
      updateStyleValue: (modelId, stylePath, value) =>
        set((s) => {
          // 用与显示一致的「有效主题」解析：若 markdownThemeId 在 themes 中找不到
          // （如 localStorage 残留了旧主题 id），getThemeById 回退到 default。
          // 必须按这个有效 id 来改，否则严格 id 匹配会全不命中 → 编辑静默失效。
          const effectiveId = getThemeById(s.themes, s.markdownThemeId).id;
          return {
            themes: s.themes.map((t) => {
              if (t.id !== effectiveId) return t;
              const model = t.model.map((m) => {
                if (m.id !== modelId) return m;
                return {...m, styles: setValueByPath(m.styles, stylePath, value)};
              });
              return recompile({...t, model});
            }),
          };
        }),
    }),
    {
      name: "vellumstyle",
      // themes 是运行期扫描结果，不持久化；content 改由文件持久化，只记住打开哪篇
      partialize: (s) => ({
        currentDocPath: s.currentDocPath,
        markdownThemeId: s.markdownThemeId,
        codeThemeId: s.codeThemeId,
        previewMode: s.previewMode,
        favoriteThemeIds: s.favoriteThemeIds,
        pinnedCodeThemeIds: s.pinnedCodeThemeIds,
      }),
    },
  ),
);

// 按 id 取当前主题（含用户主题），找不到回退默认。
export function getThemeById(themes: ThemeOption[], id: string): ThemeOption {
  return themes.find((t) => t.id === id) ?? defaultMarkdownTheme;
}

export type {StyleModel};
