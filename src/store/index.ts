import {create} from "zustand";
import {persist} from "zustand/middleware";
import {compileModel} from "../themes/compileModel.ts";
import {builtinThemes, defaultMarkdownTheme, type ThemeOption, type StyleModel} from "../themes/index.ts";
import type {StyleItem} from "../themes/themeModel.ts";
import {
  listDocuments,
  readDocument,
  readDocumentThemeMap,
  writeDocument,
  writeDocumentThemeMap,
  type DocNode,
} from "../utils/documents.ts";
import {
  remapDocumentThemes,
  removeDocumentThemes,
  resolveAvailableThemeId,
  sanitizeDocumentThemeMap,
  setDocumentTheme,
  type DocumentThemeMap,
} from "../utils/documentThemes.ts";
import {createDebouncedSaver} from "../utils/autosave.ts";
import {runCloudSync, type CloudSyncStatusValue} from "../utils/cloudSync.ts";
import {toast} from "../components/Toast/toast.ts";
import type {PreviewModeId} from "../components/Preview/previewModes.ts";
import {DEFAULT_CODE_THEME_ID, DEFAULT_PINNED_CODE_THEME_IDS, type CodeThemeId} from "../markdown/codeThemes.ts";
import {
  DEFAULT_WORKSPACE_SPLIT_RATIO,
  sanitizeWorkspaceSplitRatio,
} from "../components/Workspace/workspaceSplitLayout.ts";
import {
  DEFAULT_APPEARANCE_MODE,
  sanitizeAppearanceMode,
  type AppearanceMode,
} from "../appearance/appearanceMode.ts";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface EditorState {
  content: string;
  markdownThemeId: string;
  documentThemeIds: DocumentThemeMap;
  themeMapMigrationThemeId: string | null;
  documentThemeMapExists: boolean;
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
  syncStatus: CloudSyncStatusValue; // 文件云同步状态
  lastSyncedAt: number | null; // 最近一次同步成功时间戳
  syncMessage: string; // 最近一次同步说明或错误
  previewMode: PreviewModeId; // 预览宽度模式
  workspaceSplitRatio: number; // 编辑器/预览外层分栏比例，persist
  appearanceMode: AppearanceMode; // 应用亮暗外观，persist
  favoriteThemeIds: string[]; // 收藏主题，persist
  pinnedCodeThemeIds: CodeThemeId[]; // 置顶代码主题，persist
  setContent: (content: string) => void;
  setMarkdownTheme: (id: string) => void;
  loadDocumentThemes: (options?: {persistMissing?: boolean}) => Promise<void>;
  remapDocumentThemePaths: (fromPath: string, toPath: string) => void;
  removeDocumentThemePaths: (path: string) => void;
  setCodeTheme: (id: CodeThemeId) => void;
  setThemes: (themes: ThemeOption[]) => void;
  setSelectedModel: (modelId: string | null) => void;
  setCurrentDocPath: (path: string | null) => void;
  setSelectedPath: (path: string | null) => void;
  setPreviewMode: (mode: PreviewModeId) => void;
  setWorkspaceSplitRatio: (ratio: number) => void;
  toggleAppearanceMode: () => void;
  toggleFavoriteTheme: (id: string) => void;
  togglePinnedCodeTheme: (id: CodeThemeId) => void;
  toggleSidebar: () => void;
  toggleOutline: () => void;
  loadTree: () => Promise<void>;
  openDocument: (path: string) => Promise<void>;
  runSyncNow: () => Promise<void>;
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
const CLOUD_SYNC_DELAY_MS = 1800;
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let syncDrainPromise: Promise<void> | null = null;
let syncQueued = false;
let documentThemeWritePromise: Promise<void> = Promise.resolve();

// 主题映射文件很小，但切换/重命名可能连续发生，因此串行写入，避免旧快照覆盖新快照。
function queueDocumentThemeWrite(map: DocumentThemeMap): Promise<void> {
  const snapshot = sanitizeDocumentThemeMap(map);
  const next = documentThemeWritePromise
    .catch(() => undefined)
    .then(async () => {
      await writeDocumentThemeMap(snapshot);
      useStore.setState({documentThemeMapExists: true});
    });
  documentThemeWritePromise = next;
  return next;
}

export function flushDocumentThemeWrite(): Promise<void> {
  return documentThemeWritePromise;
}

function reportDocumentThemeWriteError(error: unknown): void {
  console.error("保存文章主题失败：", error);
  if (typeof window !== "undefined") {
    toast.show("文章主题保存失败，请检查磁盘权限。", "error");
  }
}

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
      scheduleCloudSync();
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

type ThemeResolutionState = Pick<
  EditorState,
  "documentThemeIds" | "markdownThemeId" | "themeMapMigrationThemeId" | "themes"
>;

function storedThemeIdForDocument(state: ThemeResolutionState, path: string | null): string {
  if (path && state.documentThemeIds[path]) {
    return state.documentThemeIds[path];
  }
  return path
    ? defaultMarkdownTheme.id
    : state.themeMapMigrationThemeId ?? state.markdownThemeId;
}

function effectiveThemeIdForDocument(state: ThemeResolutionState, path: string | null): string {
  return resolveAvailableThemeId(
    state.themes,
    storedThemeIdForDocument(state, path),
    defaultMarkdownTheme.id,
  );
}

function documentThemeMapsEqual(left: DocumentThemeMap, right: DocumentThemeMap): boolean {
  const leftEntries = Object.entries(left);
  return leftEntries.length === Object.keys(right).length
    && leftEntries.every(([path, themeId]) => right[path] === themeId);
}

async function runCloudSyncOnce(): Promise<void> {
  useStore.setState({syncStatus: "syncing", syncMessage: ""});
  try {
    // 主题映射和 Markdown 内容都必须在同步前落盘，避免云端看到旧快照。
    await flushDocumentThemeWrite();
    const summary = await runCloudSync();
    if (!summary.enabled) {
      // 即使未启用云同步，也把旧版迁移结果落成隐藏元数据文件，
      // 以后开启同步时即可直接上传，不依赖 localStorage。
      await useStore.getState().loadDocumentThemes({persistMissing: true});
      useStore.setState({
        syncStatus: "disabled",
        syncMessage: summary.message,
      });
      return;
    }
    // 远端可能刚下载/删除了主题映射；同步完成后重新读取文件，
    // 这样切换到远端文章时即可使用另一台设备的主题选择。
    await useStore.getState().loadDocumentThemes({persistMissing: true});
    useStore.setState({
      syncStatus: summary.conflicts > 0 ? "conflict" : "synced",
      lastSyncedAt: summary.syncedAt ?? Date.now(),
      syncMessage: summary.message,
    });
  } catch (error) {
    const message = typeof error === "string" ? error : (error as Error)?.message || "同步失败";
    console.warn("文件同步失败：", error);
    useStore.setState({syncStatus: "error", syncMessage: message});
  }
}

function startCloudSyncDrain(): Promise<void> {
  if (!syncDrainPromise) {
    syncDrainPromise = runCloudSyncOnce().finally(() => {
      syncDrainPromise = null;
      if (syncQueued) {
        syncQueued = false;
        void startCloudSyncDrain();
      }
    });
  }
  return syncDrainPromise;
}

export function scheduleCloudSync(delayMs = CLOUD_SYNC_DELAY_MS): void {
  if (syncTimer) {
    clearTimeout(syncTimer);
  }
  syncTimer = setTimeout(() => {
    syncTimer = null;
    if (syncDrainPromise) {
      syncQueued = true;
      return;
    }
    void startCloudSyncDrain();
  }, delayMs);
}

export function flushCloudSync(): Promise<void> {
  if (syncTimer) {
    clearTimeout(syncTimer);
    syncTimer = null;
  }
  if (syncDrainPromise) {
    syncQueued = true;
  }
  return startCloudSyncDrain();
}

export const useStore = create<EditorState>()(
  persist(
    (set) => ({
      content: "",
      markdownThemeId: defaultMarkdownTheme.id,
      documentThemeIds: {},
      themeMapMigrationThemeId: null,
      documentThemeMapExists: false,
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
      syncStatus: "idle",
      lastSyncedAt: null,
      syncMessage: "",
      previewMode: "fluid",
      workspaceSplitRatio: DEFAULT_WORKSPACE_SPLIT_RATIO,
      appearanceMode: DEFAULT_APPEARANCE_MODE,
      favoriteThemeIds: [],
      pinnedCodeThemeIds: [...DEFAULT_PINNED_CODE_THEME_IDS],
      setContent: (content) => {
        set({content, saveStatus: "idle"});
        scheduleSave(content);
      },
      setMarkdownTheme: (markdownThemeId) => {
        let nextMap: DocumentThemeMap | null = null;
        let hasDocument = false;
        set((s) => {
          hasDocument = Boolean(s.currentDocPath);
          nextMap = setDocumentTheme(s.documentThemeIds, s.currentDocPath, markdownThemeId);
          return {
            markdownThemeId,
            documentThemeIds: nextMap,
            // 启动迁移尚未落到文章时，用户主动选的新主题应替换待迁移值；
            // 普通无文档状态则不为后续新文章预设非默认主题。
            themeMapMigrationThemeId: hasDocument
              ? null
              : s.themeMapMigrationThemeId
                ? markdownThemeId
                : null,
          };
        });
        if (hasDocument && nextMap) {
          void queueDocumentThemeWrite(nextMap).catch(reportDocumentThemeWriteError);
          scheduleCloudSync();
        }
      },
      loadDocumentThemes: async (options = {}) => {
        // 等待本地刚发起的写入完成，再读取，避免旧磁盘快照覆盖新状态。
        await flushDocumentThemeWrite().catch(() => undefined);
        const result = await readDocumentThemeMap();
        const state = useStore.getState();
        if (result.exists) {
          const map = sanitizeDocumentThemeMap(result.map);
          set({
            documentThemeIds: map,
            documentThemeMapExists: true,
            themeMapMigrationThemeId: null,
            markdownThemeId: effectiveThemeIdForDocument(
              {...state, documentThemeIds: map},
              state.currentDocPath,
            ),
          });
          return;
        }

        // 没有元数据文件时保留 localStorage 中的迁移数据；第一次打开文章时
        // openDocument 会把旧版本的全局主题归属到那一篇，随后再写入文件。
        const map = state.documentThemeMapExists ? {} : state.documentThemeIds;
        const migrationThemeId = state.documentThemeMapExists ? null : state.themeMapMigrationThemeId;
        set({
          documentThemeIds: map,
          documentThemeMapExists: false,
          themeMapMigrationThemeId: migrationThemeId,
          markdownThemeId: effectiveThemeIdForDocument(
            {...state, documentThemeIds: map, themeMapMigrationThemeId: migrationThemeId},
            state.currentDocPath,
          ),
        });
        if (options.persistMissing && !state.documentThemeMapExists && Object.keys(map).length > 0) {
          void queueDocumentThemeWrite(map)
            .then(() => scheduleCloudSync())
            .catch(reportDocumentThemeWriteError);
        }
      },
      remapDocumentThemePaths: (fromPath, toPath) => {
        const state = useStore.getState();
        const nextMap = remapDocumentThemes(state.documentThemeIds, fromPath, toPath);
        if (documentThemeMapsEqual(state.documentThemeIds, nextMap)) return;
        set({documentThemeIds: nextMap});
        void queueDocumentThemeWrite(nextMap).catch(reportDocumentThemeWriteError);
        scheduleCloudSync();
      },
      removeDocumentThemePaths: (path) => {
        const state = useStore.getState();
        const nextMap = removeDocumentThemes(state.documentThemeIds, path);
        if (documentThemeMapsEqual(state.documentThemeIds, nextMap)) return;
        set({documentThemeIds: nextMap});
        void queueDocumentThemeWrite(nextMap).catch(reportDocumentThemeWriteError);
        scheduleCloudSync();
      },
      setCodeTheme: (codeThemeId) => set({codeThemeId}),
      setThemes: (themes) =>
        set((state) => ({
          themes,
          // documentThemeIds 保存文章真正选择的 ID；本机缺少该自定义主题时，
          // markdownThemeId 只回退为默认用于展示，不反向污染同步映射。
          markdownThemeId: effectiveThemeIdForDocument({...state, themes}, state.currentDocPath),
        })),
      setSelectedModel: (selectedModelId) => set({selectedModelId}),
      setCurrentDocPath: (currentDocPath) => set({currentDocPath}),
      setSelectedPath: (selectedPath) => set({selectedPath}),
      setPreviewMode: (previewMode) => set({previewMode}),
      setWorkspaceSplitRatio: (workspaceSplitRatio) =>
        set({workspaceSplitRatio: sanitizeWorkspaceSplitRatio(workspaceSplitRatio)}),
      toggleAppearanceMode: () =>
        set((s) => ({appearanceMode: s.appearanceMode === "light" ? "dark" : "light"})),
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
        await flushDocumentThemeWrite().catch(() => undefined);
        const text = await readDocument(path);
        const state = useStore.getState();
        let map = state.documentThemeIds;
        let migrationThemeId = state.themeMapMigrationThemeId;
        let storedThemeId = map[path];

        // 旧版本只有一个全局主题。若旧状态没有 currentDocPath，
        // 将它迁移给首次打开的文章，其余文章则从默认主题开始。
        if (!storedThemeId && migrationThemeId) {
          storedThemeId = migrationThemeId;
          map = setDocumentTheme(map, path, storedThemeId);
          migrationThemeId = null;
          // 若本机已有明确的元数据文件，可以立即落盘；旧版本没有元数据时
          // 延迟到首次同步完成后再写，避免用旧全局主题覆盖云端按文章映射。
          if (state.documentThemeMapExists) {
            void queueDocumentThemeWrite(map).catch(reportDocumentThemeWriteError);
          }
          scheduleCloudSync();
        }
        storedThemeId ??= defaultMarkdownTheme.id;
        set({
          currentDocPath: path,
          selectedPath: path,
          content: text,
          markdownThemeId: resolveAvailableThemeId(
            state.themes,
            storedThemeId,
            defaultMarkdownTheme.id,
          ),
          documentThemeIds: map,
          themeMapMigrationThemeId: migrationThemeId,
          selectedModelId: null,
          saveStatus: "saved",
          lastSavedAt: Date.now(),
        });
      },
      runSyncNow: () => flushCloudSync(),
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
      // themes 是运行期扫描结果，不持久化；content 改由文件持久化，只记住打开哪篇。
      // documentThemeIds 同时写入本地状态作为启动缓存，真正的跨设备真相源是
      // documents/.vellumstyle-theme-map.json。
      partialize: (s) => ({
        currentDocPath: s.currentDocPath,
        markdownThemeId: s.markdownThemeId,
        documentThemeIds: s.documentThemeIds,
        themeMapMigrationThemeId: s.themeMapMigrationThemeId,
        documentThemeMapExists: s.documentThemeMapExists,
        codeThemeId: s.codeThemeId,
        previewMode: s.previewMode,
        workspaceSplitRatio: s.workspaceSplitRatio,
        appearanceMode: s.appearanceMode,
        favoriteThemeIds: s.favoriteThemeIds,
        pinnedCodeThemeIds: s.pinnedCodeThemeIds,
      }),
      merge: (persisted, current) => {
        const saved = persisted as (Partial<EditorState> & {themeMapMigrationPending?: boolean}) | undefined;
        const hasDocumentThemeMap = Boolean(
          saved && Object.prototype.hasOwnProperty.call(saved, "documentThemeIds"),
        );
        let documentThemeIds = sanitizeDocumentThemeMap(saved?.documentThemeIds);
        let themeMapMigrationThemeId = typeof saved?.themeMapMigrationThemeId === "string"
          ? saved.themeMapMigrationThemeId.trim() || null
          : null;

        // 兼容本功能开发期间保存过的布尔迁移标记。
        if (!themeMapMigrationThemeId && saved?.themeMapMigrationPending) {
          const pendingId = typeof saved.markdownThemeId === "string" ? saved.markdownThemeId.trim() : "";
          themeMapMigrationThemeId = pendingId || null;
        }

        // 兼容旧版本：旧状态没有按文档映射时，把旧全局主题只归属给
        // 上次打开的文章；若没有上次打开的文章，则延迟到首次 openDocument。
        if (!hasDocumentThemeMap) {
          const legacyThemeId = typeof saved?.markdownThemeId === "string" ? saved.markdownThemeId : "";
          if (saved?.currentDocPath && legacyThemeId) {
            documentThemeIds = setDocumentTheme({}, saved.currentDocPath, legacyThemeId);
            themeMapMigrationThemeId = null;
          } else {
            themeMapMigrationThemeId = legacyThemeId && legacyThemeId !== defaultMarkdownTheme.id
              ? legacyThemeId
              : null;
          }
        }

        return {
          ...current,
          ...saved,
          documentThemeIds,
          themeMapMigrationThemeId,
          documentThemeMapExists: Boolean(saved?.documentThemeMapExists),
          workspaceSplitRatio: sanitizeWorkspaceSplitRatio(saved?.workspaceSplitRatio),
          appearanceMode: sanitizeAppearanceMode(saved?.appearanceMode),
        };
      },
    },
  ),
);

// 按 id 取当前主题（含用户主题），找不到回退默认。
export function getThemeById(themes: ThemeOption[], id: string): ThemeOption {
  return themes.find((t) => t.id === id) ?? defaultMarkdownTheme;
}

export type {StyleModel};
