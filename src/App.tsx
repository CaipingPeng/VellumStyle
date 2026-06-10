import {useEffect, useRef, useState} from "react";
import MarkdownEditor, {type MarkdownEditorHandle} from "./components/Editor/MarkdownEditor.tsx";
import Preview, {type PreviewHandle} from "./components/Preview/Preview.tsx";
import SettingsDialog from "./components/Settings/SettingsDialog.tsx";
import StylePanel from "./components/StylePanel/StylePanel.tsx";
import SyntaxToolbar from "./components/Toolbar/SyntaxToolbar.tsx";
import MainToolbar from "./components/Toolbar/MainToolbar.tsx";
import DocTree from "./components/DocTree/DocTree.tsx";
import IconButton from "./components/ui/IconButton.tsx";
import Toaster from "./components/Toast/Toaster.tsx";
import {toast} from "./components/Toast/toast.ts";
import {useStore, getThemeById, flushSave} from "./store/index.ts";
import {loadAllThemes} from "./themes/loader.ts";
import {defaultMarkdownTheme} from "./themes/index.ts";
import {uploadImage, uploadLocalImage, type UploadError} from "./utils/upload.ts";
import {createScrollSync} from "./utils/syncScroll.ts";
import {createDocument, writeDocument, type DocNode} from "./utils/documents.ts";
import {isTauriRuntime} from "./utils/tauriEnv.ts";
import {getCurrentWindow} from "@tauri-apps/api/window";
import {PanelLeft} from "lucide-react";
import defaultContent from "./content.md?raw";

// 取树里第一篇文档路径（深度优先）。
function flattenFirst(nodes: DocNode[]): string | null {
  for (const n of nodes) {
    if (!n.isDir) return n.path;
    const c = flattenFirst(n.children);
    if (c) return c;
  }
  return null;
}

function existsInTree(nodes: DocNode[], path: string): boolean {
  for (const n of nodes) {
    if (!n.isDir && n.path === path) return true;
    if (n.isDir && existsInTree(n.children, path)) return true;
  }
  return false;
}

function formatSaveStatus(status: "idle" | "saving" | "saved" | "error", lastSavedAt: number | null): string {
  if (status === "saving") return "保存中";
  if (status === "error") return "保存失败";
  if (status === "saved") {
    if (!lastSavedAt) return "已保存";
    const d = new Date(lastSavedAt);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `已保存 ${hh}:${mm}`;
  }
  return "未保存";
}

export default function App() {
  const {content, markdownThemeId, themes, currentDocPath, sidebarOpen, saveStatus, lastSavedAt, setContent, setThemes, setMarkdownTheme, loadTree, openDocument, toggleSidebar} = useStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const previewRef = useRef<PreviewHandle>(null);

  const insertUploadedImage = (url: string) => {
    editorRef.current?.insertAtCursor(`\n![](${url})\n`);
  };

  const handleUploadError = (e: unknown) => {
    const err = e as UploadError;
    if (err.code === "NOT_CONFIGURED") {
      toast.show("尚未配置微信图床：请点右上角「设置」填写公众号 AppID/AppSecret。", "error");
      setSettingsOpen(true);
    } else {
      toast.show(err.message || "图片上传失败", "error");
    }
  };

  // 上传按钮和粘贴共用一条路径：上传 → 光标处插入 → 统一错误提示。
  const handleUploadFile = async (file: File) => {
    try {
      insertUploadedImage(await uploadImage(file));
    } catch (e) {
      handleUploadError(e);
    }
  };

  const handleUploadLocal = async (path: string) => {
    try {
      insertUploadedImage(await uploadLocalImage(path));
    } catch (e) {
      handleUploadError(e);
    }
  };

  // 启动扫描主题：内置（编译进包）+ 用户目录 *.json 合并。
  // 合并后若当前 markdownThemeId 已不存在（如 localStorage 残留旧主题 id），
  // 重置为默认，避免选中态/编辑指向不存在的主题。
  useEffect(() => {
    loadAllThemes().then((all) => {
      setThemes(all);
      const cur = useStore.getState().markdownThemeId;
      if (!all.some((t) => t.id === cur)) {
        setMarkdownTheme(defaultMarkdownTheme.id);
      }
    });
  }, [setThemes, setMarkdownTheme]);

  // 启动：加载文档树；迁移旧 localStorage 草稿；决定打开哪篇。
  useEffect(() => {
    (async () => {
      await loadTree();
      const tree = useStore.getState().tree;
      const persistedPath = useStore.getState().currentDocPath;
      const legacyContent = useStore.getState().content;

      // 迁移：documents/ 为空 且有旧 content → 存成 草稿.md。
      if (tree.length === 0 && legacyContent) {
        const path = await createDocument("", "草稿");
        await writeDocument(path, legacyContent);
        await loadTree();
        await openDocument(path);
        return;
      }
      // 首次空仓库且无旧内容：写一篇默认教程。
      if (tree.length === 0 && !legacyContent && defaultContent) {
        const path = await createDocument("", "示例");
        await writeDocument(path, defaultContent);
        await loadTree();
        await openDocument(path);
        return;
      }
      // 已有文档：打开上次的，否则打开第一篇。
      if (persistedPath && existsInTree(tree, persistedPath)) {
        await openDocument(persistedPath);
      } else {
        const first = flattenFirst(tree);
        if (first) await openDocument(first);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 关窗前把当前文档落盘，防丢最后 800ms 编辑。
  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }
    const win = getCurrentWindow();
    const unlisten = win.onCloseRequested(async (event) => {
      event.preventDefault();
      // 保存失败也必须放行关闭，否则窗口永远关不掉。
      try {
        await flushSave();
      } catch (err) {
        console.error("关窗前保存失败：", err);
      } finally {
        await win.destroy();
      }
    });
    return () => {
      void unlisten.then((f) => f());
    };
  }, []);

  // 编辑器 ↔ 预览 双向同步滚动。CodeMirror 的 .cm-scroller 首帧可能未挂载，rAF 重试到拿到为止。
  useEffect(() => {
    let sync: {destroy: () => void} | null = null;
    let raf = 0;
    const attach = () => {
      const editor = editorRef.current;
      const preview = previewRef.current;
      const editorScroller = editor?.getScroller();
      const previewScroller = preview?.getScroller();
      if (!editor || !editorScroller || !previewScroller) {
        raf = requestAnimationFrame(attach);
        return;
      }
      sync = createScrollSync({
        editorScroller,
        previewScroller,
        getEditorTopLine: () => editor.getTopLine(),
        scrollEditorToLine: (line) => editor.scrollToLine(line),
      });
    };
    attach();
    return () => {
      cancelAnimationFrame(raf);
      sync?.destroy();
    };
  }, []);

  const lineCount = content ? content.split("\n").length : 0;
  const charCount = content.length;

  return (
    <div style={{display: "flex", flexDirection: "column", height: "100%"}}>
      {/* Navbar */}
      <header className="flex h-[52px] flex-shrink-0 items-center justify-between border-b border-border bg-bg/80 px-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <IconButton active={sidebarOpen} title="文档" onClick={toggleSidebar}>
            <PanelLeft size={16} />
          </IconButton>
          <SyntaxToolbar editorRef={editorRef} />
        </div>
        <MainToolbar
          onPickFile={handleUploadFile}
          onPickLocal={handleUploadLocal}
          onOpenSettings={() => setSettingsOpen(true)}
          onNeedSettings={() => setSettingsOpen(true)}
        />
      </header>

      {/* 主体：文档树 + 编辑器 + 预览 */}
      <main className="relative flex min-h-0 flex-1">
        {sidebarOpen && <DocTree />}
        <div className="min-w-0 flex-1 overflow-hidden border-r border-border">
          <MarkdownEditor
            ref={editorRef}
            value={content}
            onChange={setContent}
            onPasteImage={handleUploadFile}
          />
        </div>
        <div className="flex min-w-0 flex-1">
          <div className="min-w-0 flex-1">
            <Preview
              ref={previewRef}
              content={content}
              markdownThemeId={markdownThemeId}
            />
          </div>
          <StylePanel />
        </div>
      </main>

      {/* Footer */}
      <footer className="flex h-7 flex-shrink-0 items-center gap-4 border-t border-border bg-bg-secondary px-4 text-xs text-text-muted">
        <span className="tabular-nums">行数 {lineCount}</span>
        <span className="tabular-nums">字数 {charCount}</span>
        <span>主题 {getThemeById(themes, markdownThemeId).name}</span>
        {currentDocPath && <span>文档 {currentDocPath.split("/").pop()}</span>}
        <span className={saveStatus === "error" ? "text-danger" : ""}>{formatSaveStatus(saveStatus, lastSavedAt)}</span>
      </footer>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <Toaster />
    </div>
  );
}
