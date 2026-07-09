import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import MarkdownEditor, {type MarkdownEditorHandle} from "./components/Editor/MarkdownEditor.tsx";
import Preview, {type PreviewHandle} from "./components/Preview/Preview.tsx";
import PreviewModeToggle from "./components/Preview/PreviewModeToggle.tsx";
import SettingsDialog from "./components/Settings/SettingsDialog.tsx";
import StylePanel from "./components/StylePanel/StylePanel.tsx";
import SyntaxToolbar from "./components/Toolbar/SyntaxToolbar.tsx";
import MainToolbar from "./components/Toolbar/MainToolbar.tsx";
import DocTree from "./components/DocTree/DocTree.tsx";
import OutlineNav from "./components/Outline/OutlineNav.tsx";
import UpdatePromptDialog from "./components/Update/UpdatePromptDialog.tsx";
import IpChangedDialog from "./components/Update/IpChangedDialog.tsx";
import ImageMaterialPickerDialog from "./components/Upload/ImageMaterialPickerDialog.tsx";
import IconButton from "./components/ui/IconButton.tsx";
import Toaster from "./components/Toast/Toaster.tsx";
import {toast} from "./components/Toast/toast.ts";
import {useStore, getThemeById, flushSave} from "./store/index.ts";
import {getCodeThemeById} from "./markdown/codeThemes.ts";
import {formatMarkdownImage, replaceMarkdownImageSizeByIndex} from "./markdown/imageMarkdown.ts";
import {getActiveOutlineLine, parseMarkdownOutline} from "./utils/outline.ts";
import {loadAllThemes} from "./themes/loader.ts";
import {defaultMarkdownTheme} from "./themes/index.ts";
import {uploadImage, uploadLocalImage, type UploadError} from "./utils/upload.ts";
import {createScrollSync} from "./utils/syncScroll.ts";
import {createDocument, writeDocument, type DocNode} from "./utils/documents.ts";
import {formatSyncStatus as formatCloudSyncStatus, syncStatusTone, type CloudSyncTone} from "./utils/cloudSync.ts";
import {isTauriRuntime} from "./utils/tauriEnv.ts";
import {
  checkForAppUpdate,
  formatAppUpdateError,
  getCurrentAppVersion,
  installAppUpdate,
  type AppUpdateCandidate,
} from "./utils/appUpdater.ts";
import {
  checkStartupOutboundIp,
  shouldRunStartupOutboundIpCheck,
} from "./utils/outboundIpMonitor.ts";
import {defaultWindowIcon} from "@tauri-apps/api/app";
import {invoke} from "@tauri-apps/api/core";
import {getCurrentWindow} from "@tauri-apps/api/window";
import {ListTree, PanelLeft} from "lucide-react";
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

function syncStatusClass(tone: CloudSyncTone): string {
  if (tone === "accent") return "text-accent";
  if (tone === "success") return "text-success";
  if (tone === "warning") return "text-warning";
  if (tone === "danger") return "text-danger";
  return "";
}

export default function App() {
  const {content, markdownThemeId, codeThemeId, themes, currentDocPath, sidebarOpen, outlineOpen, saveStatus, lastSavedAt, syncStatus, lastSyncedAt, syncMessage, setContent, setThemes, setMarkdownTheme, loadTree, openDocument, toggleSidebar, toggleOutline} = useStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [startupUpdatePromptOpen, setStartupUpdatePromptOpen] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<AppUpdateCandidate | null>(null);
  const [currentVersion, setCurrentVersion] = useState("");
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateInstalling, setUpdateInstalling] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<"idle" | "checking" | "available" | "none" | "installing" | "error" | "unsupported">("idle");
  const [updateMessage, setUpdateMessage] = useState("");
  const [activeOutlineLine, setActiveOutlineLine] = useState<number | null>(null);
  const [ipChanged, setIpChanged] = useState<{previousIp: string; currentIp: string} | null>(null);
  const [imageMaterialPickerOpen, setImageMaterialPickerOpen] = useState(false);
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const previewRef = useRef<PreviewHandle>(null);
  const outlineItems = useMemo(() => parseMarkdownOutline(content), [content]);

  const insertUploadedImage = (url: string) => {
    editorRef.current?.insertAtCursor(`\n${formatMarkdownImage({alt: "", url})}\n`);
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

  const handleOpenImageMaterialPicker = useCallback(() => {
    setImageMaterialPickerOpen(true);
  }, []);

  const handleNeedSettings = useCallback(() => {
    setSettingsOpen(true);
  }, []);

  const handlePickMaterialImage = useCallback((url: string) => {
    editorRef.current?.insertAtCursor(`\n${formatMarkdownImage({alt: "", url})}\n`);
  }, []);

  const handleResizePreviewImage = useCallback((imageIndex: number, size: {width: string}) => {
    const result = replaceMarkdownImageSizeByIndex(useStore.getState().content, imageIndex, size);
    if (result.changed) {
      setContent(result.markdown);
    }
  }, [setContent]);

  const handleOutlineJump = useCallback((line: number) => {
    setActiveOutlineLine(line);
    editorRef.current?.scrollToLine(line);
    previewRef.current?.scrollToLine(line);
  }, []);

  const handleCheckForUpdates = useCallback(async (options?: {silent?: boolean}) => {
    if (updateChecking || updateInstalling) return;
    setUpdateChecking(true);
    setUpdateStatus("checking");
    if (!options?.silent) {
      setUpdateMessage("");
    }
    try {
      const result = await checkForAppUpdate();
      if (result.status === "available") {
        setAvailableUpdate(result.update);
        setCurrentVersion(result.update.currentVersion);
        setUpdateStatus("available");
        setUpdateMessage(`新版本 ${result.update.version} 已准备好下载。`);
        if (options?.silent) {
          setStartupUpdatePromptOpen(true);
        }
        return;
      }

      setAvailableUpdate(null);
      setCurrentVersion(result.currentVersion);
      setUpdateStatus(result.status === "unsupported" ? "unsupported" : "none");
      if (!options?.silent) {
        setUpdateMessage(result.status === "unsupported" ? "当前运行环境不支持自动更新。" : "当前已是最新版本。");
      }
    } catch (err) {
      const message = formatAppUpdateError(err);
      setUpdateStatus("error");
      if (options?.silent) {
        console.warn("启动时自动检查更新失败：", err);
      } else {
        setUpdateMessage(message);
        toast.show(message, "error");
      }
    } finally {
      setUpdateChecking(false);
    }
  }, [updateChecking, updateInstalling]);

  const handleInstallUpdate = useCallback(async () => {
    if (!availableUpdate || updateInstalling) return;
    setUpdateInstalling(true);
    setUpdateStatus("installing");
    setUpdateMessage("正在下载更新…");
    try {
      let downloaded = 0;
      await installAppUpdate(availableUpdate, (event) => {
        if (event.event === "Started") {
          setUpdateMessage(event.data.contentLength ? `正在下载更新包，共 ${formatBytes(event.data.contentLength)}。` : "正在下载更新包。");
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          setUpdateMessage(`正在下载更新包，已下载 ${formatBytes(downloaded)}。`);
        } else if (event.event === "Finished") {
          setUpdateMessage("下载完成，正在安装并重启。");
        }
      });
    } catch (err) {
      const message = formatAppUpdateError(err);
      setUpdateStatus("available");
      setUpdateMessage(message);
      toast.show(message, "error");
    } finally {
      setUpdateInstalling(false);
    }
  }, [availableUpdate, updateInstalling]);

  const updateState = useMemo(() => ({
    status: updateStatus,
    currentVersion,
    version: availableUpdate?.version,
    body: availableUpdate?.body,
    checking: updateChecking,
    installing: updateInstalling,
    message: updateMessage,
    onCheck: () => void handleCheckForUpdates(),
    onInstall: () => void handleInstallUpdate(),
  }), [availableUpdate?.body, availableUpdate?.version, currentVersion, handleCheckForUpdates, handleInstallUpdate, updateChecking, updateInstalling, updateMessage, updateStatus]);

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
        void useStore.getState().runSyncNow();
        return;
      }
      // 首次空仓库且无旧内容：写一篇默认教程。
      if (tree.length === 0 && !legacyContent && defaultContent) {
        const path = await createDocument("", "示例");
        await writeDocument(path, defaultContent);
        await loadTree();
        await openDocument(path);
        void useStore.getState().runSyncNow();
        return;
      }
      // 已有文档：打开上次的，否则打开第一篇。
      if (persistedPath && existsInTree(tree, persistedPath)) {
        await openDocument(persistedPath);
      } else {
        const first = flattenFirst(tree);
        if (first) await openDocument(first);
      }
      void useStore.getState().runSyncNow();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setActiveOutlineLine((currentLine) => getActiveOutlineLine(outlineItems, currentLine) ?? outlineItems[0]?.line ?? null);
  }, [outlineItems]);

  // 预览滚动时，读取视口顶部附近的标题行，更新大纲高亮。
  useEffect(() => {
    let raf = 0;
    let retryRaf = 0;
    let timer = 0;
    let cleanup: (() => void) | null = null;

    const updateActiveLine = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const headingLine = previewRef.current?.getActiveHeadingLine() ?? null;
        setActiveOutlineLine(getActiveOutlineLine(outlineItems, headingLine));
      });
    };

    const attach = () => {
      const scroller = previewRef.current?.getScroller();
      if (!scroller) {
        retryRaf = requestAnimationFrame(attach);
        return;
      }
      scroller.addEventListener("scroll", updateActiveLine, {passive: true});
      cleanup = () => scroller.removeEventListener("scroll", updateActiveLine);
      updateActiveLine();
      timer = window.setTimeout(updateActiveLine, 160);
    };

    attach();
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(retryRaf);
      window.clearTimeout(timer);
      cleanup?.();
    };
  }, [outlineItems]);

  // 在桌面运行时显式应用默认图标，覆盖 dev 窗口/任务栏的运行时图标。
  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const icon = await defaultWindowIcon();
        if (!cancelled && icon) {
          await getCurrentWindow().setIcon(icon);
        }
      } catch (err) {
        console.warn("设置窗口图标失败：", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    let cancelled = false;
    void getCurrentAppVersion()
      .then((version) => {
        if (!cancelled) setCurrentVersion(version);
      })
      .catch(() => {});
    void handleCheckForUpdates({silent: true});

    return () => {
      cancelled = true;
    };
    // Run once after the update handlers have their initial closures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 桌面端完整启动后后台检查一次出口 IP；变化时提醒用户更新公众号 IP 白名单。
  useEffect(() => {
    if (!isTauriRuntime() || !shouldRunStartupOutboundIpCheck()) {
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const result = await checkStartupOutboundIp(() => invoke<string>("get_outbound_ip"));
        if (!cancelled && result.status === "changed") {
          setIpChanged({previousIp: result.previousIp, currentIp: result.currentIp});
        }
      } catch (err) {
        console.warn("启动时自动检测出口 IP 失败：", err);
      }
    })();

    return () => {
      cancelled = true;
    };
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
        getEditorScrollTop: () => editor.getScrollTop(),
        getEditorLineTop: (line) => editor.getLineTop(line),
        getEditorMaxScrollTop: () => editor.getMaxScrollTop(),
        scrollEditorToTop: (top) => editor.scrollToTop(top),
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
  const startupReleaseNotes = availableUpdate?.body?.trim();

  return (
    <div style={{display: "flex", flexDirection: "column", height: "100%"}}>
      {/* Navbar */}
      <header className="relative z-50 flex h-[52px] flex-shrink-0 items-center justify-between gap-3 border-b border-border bg-bg/80 px-4 backdrop-blur">
        <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
          <IconButton active={sidebarOpen} title="文档" aria-pressed={sidebarOpen} onClick={toggleSidebar}>
            <PanelLeft size={16} />
          </IconButton>
          <IconButton active={outlineOpen} title="大纲" aria-pressed={outlineOpen} onClick={toggleOutline}>
            <ListTree size={16} />
          </IconButton>
          <SyntaxToolbar
            editorRef={editorRef}
            onPickFile={handleUploadFile}
            onPickLocal={handleUploadLocal}
            onOpenMaterialLibrary={handleOpenImageMaterialPicker}
          />
        </div>
        <MainToolbar
          onOpenSettings={() => setSettingsOpen(true)}
          onNeedSettings={() => setSettingsOpen(true)}
          hasUpdateNotification={Boolean(availableUpdate)}
        />
      </header>

      {/* 主体：文档树 + 编辑器 + 预览 */}
      <main className="relative flex min-h-0 flex-1">
        {sidebarOpen && <DocTree />}
        {outlineOpen && (
          <OutlineNav
            items={outlineItems}
            activeLine={activeOutlineLine}
            onJump={handleOutlineJump}
          />
        )}
        <div className="min-w-0 flex-1 overflow-hidden">
          <MarkdownEditor
            ref={editorRef}
            value={content}
            documentKey={currentDocPath}
            onChange={setContent}
            onPasteImage={handleUploadFile}
          />
        </div>
        <div className="w-px flex-none bg-border-strong" aria-hidden="true" />
        <div className="flex min-w-0 flex-1">
          <div className="min-w-0 flex-1">
            <Preview
              ref={previewRef}
              content={content}
              markdownThemeId={markdownThemeId}
              onResizeImage={handleResizePreviewImage}
            />
          </div>
          <StylePanel />
        </div>
      </main>

      {/* Footer */}
      <footer className="flex h-7 flex-shrink-0 items-center justify-between gap-4 border-t border-border bg-bg-secondary px-4 text-xs text-text-muted">
        <div className="flex min-w-0 items-center gap-4">
          {currentDocPath && <span className="min-w-0 max-w-[260px] truncate">文档 {currentDocPath.split("/").pop()}</span>}
          <span className="tabular-nums">行数 {lineCount}</span>
          <span className="tabular-nums">字数 {charCount}</span>
        </div>
        <div className="flex flex-none items-center gap-4">
          <span>主题 {getThemeById(themes, markdownThemeId).name}</span>
          <span>代码 {getCodeThemeById(codeThemeId).name}</span>
          <span className={saveStatus === "error" ? "text-danger" : ""}>{formatSaveStatus(saveStatus, lastSavedAt)}</span>
          <span
            className={syncStatusClass(syncStatusTone(syncStatus))}
            title={syncMessage || undefined}
          >
            {formatCloudSyncStatus({status: syncStatus, lastSyncedAt, message: syncMessage})}
          </span>
          <PreviewModeToggle variant="status" />
        </div>
      </footer>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} updateState={updateState} />
      <UpdatePromptDialog
        open={startupUpdatePromptOpen}
        version={availableUpdate?.version}
        currentVersion={availableUpdate?.currentVersion || currentVersion}
        releaseNotes={startupReleaseNotes}
        message={updateMessage}
        installing={updateInstalling}
        onClose={() => {
          if (!updateInstalling) setStartupUpdatePromptOpen(false);
        }}
        onInstall={() => void handleInstallUpdate()}
      />
      <IpChangedDialog
        open={ipChanged !== null}
        previousIp={ipChanged?.previousIp ?? ""}
        currentIp={ipChanged?.currentIp ?? ""}
        onClose={() => setIpChanged(null)}
      />
      <ImageMaterialPickerDialog
        open={imageMaterialPickerOpen}
        onClose={() => setImageMaterialPickerOpen(false)}
        onPick={handlePickMaterialImage}
        onNeedSettings={handleNeedSettings}
      />
      <Toaster />
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}
