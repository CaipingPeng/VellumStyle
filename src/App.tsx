import {useEffect, useRef, useState} from "react";
import MarkdownEditor, {type MarkdownEditorHandle} from "./components/Editor/MarkdownEditor.tsx";
import Preview, {type PreviewHandle} from "./components/Preview/Preview.tsx";
import CopyButton from "./components/Copy/CopyButton.tsx";
import ThemeMenu from "./components/Theme/ThemeMenu.tsx";
import UploadButton from "./components/Upload/UploadButton.tsx";
import ImportButton from "./components/Import/ImportButton.tsx";
import SettingsDialog from "./components/Settings/SettingsDialog.tsx";
import StylePanel from "./components/StylePanel/StylePanel.tsx";
import {useStore, getThemeById} from "./store/index.ts";
import {loadAllThemes} from "./themes/loader.ts";
import {uploadImage, type UploadError} from "./utils/upload.ts";
import {createScrollSync} from "./utils/syncScroll.ts";
import defaultContent from "./content.md?raw";

export default function App() {
  const {content, markdownThemeId, themes, setContent, setThemes} = useStore();
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
        window.alert("尚未配置微信图床：请点右上角「设置」填写公众号 AppID/AppSecret。");
        setSettingsOpen(true);
      } else {
        window.alert(err.message || "图片上传失败");
      }
    }
  };

  // 启动扫描主题：内置（编译进包）+ 用户目录 app_data_dir/themes/*.css 合并。
  useEffect(() => {
    loadAllThemes().then(setThemes);
  }, [setThemes]);

  // 首次加载默认教程内容（仅当无草稿时，避免覆盖 persist 恢复的内容）。
  // content.md 在打包时以 ?raw 内联，桌面端无需运行时 fetch。
  useEffect(() => {
    if (!useStore.getState().content && defaultContent) {
      setContent(defaultContent);
    }
  }, [setContent]);

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
        <span style={{fontWeight: 600, color: "#1e6bb8"}}>微信公众号排版工具</span>
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
          <CopyButton />
        </div>
      </header>

      {/* 主体：编辑器 + 预览 */}
      <main style={{flex: 1, display: "flex", minHeight: 0, position: "relative"}}>
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
      </footer>

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
