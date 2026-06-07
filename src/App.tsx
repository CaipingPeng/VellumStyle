import {useEffect, useRef, useState} from "react";
import MarkdownEditor, {type MarkdownEditorHandle} from "./components/Editor/MarkdownEditor.tsx";
import Preview, {type PreviewHandle} from "./components/Preview/Preview.tsx";
import CopyButton from "./components/Copy/CopyButton.tsx";
import ThemeMenu from "./components/Theme/ThemeMenu.tsx";
import UploadButton from "./components/Upload/UploadButton.tsx";
import ImportButton from "./components/Import/ImportButton.tsx";
import SettingsDialog from "./components/Settings/SettingsDialog.tsx";
import StylePanel from "./components/StylePanel/StylePanel.tsx";
import SyntaxToolbar from "./components/Toolbar/SyntaxToolbar.tsx";
import DocTree from "./components/DocTree/DocTree.tsx";
import PublishButton from "./components/Publish/PublishButton.tsx";
import Toaster from "./components/Toast/Toaster.tsx";
import {toast} from "./components/Toast/toast.ts";
import {useStore, getThemeById, flushSave} from "./store/index.ts";
import {loadAllThemes} from "./themes/loader.ts";
import {defaultMarkdownTheme} from "./themes/index.ts";
import {uploadImage, type UploadError} from "./utils/upload.ts";
import {createScrollSync} from "./utils/syncScroll.ts";
import {createDocument, writeDocument, type DocNode} from "./utils/documents.ts";
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

export default function App() {
  const {content, markdownThemeId, themes, currentDocPath, sidebarOpen, setContent, setThemes, setMarkdownTheme, loadTree, openDocument, toggleSidebar} = useStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const previewRef = useRef<PreviewHandle>(null);

  // 上传按钮和粘贴共用一条路径：上传 → 光标处插入 → 统一错误提示。
  const handleUploadFile = async (file: File) => {
    try {
      const url = await uploadImage(file);
      editorRef.current?.insertAtCursor(`\n![](${url})\n`);
    } catch (e) {
      const err = e as UploadError;
      if (err.code === "NOT_CONFIGURED") {
        toast.show("尚未配置微信图床：请点右上角「设置」填写公众号 AppID/AppSecret。", "error");
        setSettingsOpen(true);
      } else {
        toast.show(err.message || "图片上传失败", "error");
      }
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
    const win = getCurrentWindow();
    const unlisten = win.onCloseRequested(async (event) => {
      event.preventDefault();
      await flushSave();
      await win.destroy();
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
      <header
        style={{
          height: 50,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          borderBottom: "1px solid #e8e8e8",
          background: "#fff",
        }}
      >
        <div style={{display: "flex", alignItems: "center", gap: 12}}>
          <button
            type="button"
            title="文档"
            onClick={toggleSidebar}
            style={{
              width: 30,
              height: 30,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              border: "1px solid #d9d9d9",
              borderRadius: 4,
              background: sidebarOpen ? "#e6f0fa" : "#fff",
              color: sidebarOpen ? "#1e6bb8" : "#333",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <PanelLeft size={16} />
          </button>
          <SyntaxToolbar editorRef={editorRef} />
        </div>
        <div style={{display: "flex", alignItems: "center", gap: 12}}>
          <UploadButton onPick={handleUploadFile} />
          <ImportButton />
          <ThemeMenu />
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            style={{
              height: 30,
              padding: "0 12px",
              fontSize: 13,
              border: "1px solid #d9d9d9",
              borderRadius: 4,
              background: "#fff",
              color: "#333",
              cursor: "pointer",
            }}
          >
            设置
          </button>
          <PublishButton onNeedSettings={() => setSettingsOpen(true)} />
          <CopyButton />
        </div>
      </header>

      {/* 主体：文档树 + 编辑器 + 预览 */}
      <main style={{flex: 1, display: "flex", minHeight: 0, position: "relative"}}>
        {sidebarOpen && <DocTree />}
        <div style={{flex: 1, borderRight: "1px solid #e8e8e8", minWidth: 0, overflow: "hidden"}}>
          <MarkdownEditor
            ref={editorRef}
            value={content}
            onChange={setContent}
            onPasteImage={handleUploadFile}
          />
        </div>
        <div style={{flex: 1, minWidth: 0, display: "flex"}}>
          <div style={{flex: 1, minWidth: 0}}>
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
      <footer
        style={{
          height: 28,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 16,
          padding: "0 16px",
          borderTop: "1px solid #e8e8e8",
          background: "#fafafa",
          fontSize: 12,
          color: "#888",
        }}
      >
        <span>行数 {lineCount}</span>
        <span>字数 {charCount}</span>
        <span>主题 {getThemeById(themes, markdownThemeId).name}</span>
        {currentDocPath && <span>文档 {currentDocPath.split("/").pop()}</span>}
      </footer>

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
      <Toaster />
    </div>
  );
}
