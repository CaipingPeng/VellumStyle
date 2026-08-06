import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {AnimatePresence, motion, useReducedMotion} from "framer-motion";
import MarkdownEditor, {type MarkdownEditorHandle} from "./components/Editor/MarkdownEditor.tsx";
import Preview, {type PreviewHandle} from "./components/Preview/Preview.tsx";
import PreviewModeToggle from "./components/Preview/PreviewModeToggle.tsx";
import AppearanceToggle from "./components/Appearance/AppearanceToggle.tsx";
import SettingsDialog from "./components/Settings/SettingsDialog.tsx";
import MainToolbar from "./components/Toolbar/MainToolbar.tsx";
import DocTree from "./components/DocTree/DocTree.tsx";
import OutlineNav from "./components/Outline/OutlineNav.tsx";
import WorkspaceSplit from "./components/Workspace/WorkspaceSplit.tsx";
import EditorWorkspacePanel from "./components/Workspace/EditorWorkspacePanel.tsx";
import UpdatePromptDialog from "./components/Update/UpdatePromptDialog.tsx";
import IpChangedDialog from "./components/Update/IpChangedDialog.tsx";
import ImageMaterialPickerDialog from "./components/Upload/ImageMaterialPickerDialog.tsx";
import EmojiPickerDialog from "./components/Upload/EmojiPickerDialog.tsx";
import PhoneUploadDialog from "./components/Upload/PhoneUploadDialog.tsx";
import ArticleTaskLog from "./components/Tasks/ArticleTaskLog.tsx";
import IconButton from "./components/ui/IconButton.tsx";
import Toaster from "./components/Toast/Toaster.tsx";
import {toast} from "./components/Toast/toast.ts";
import {useStore, getThemeById, flushDocumentThemeWrite, flushSave} from "./store/index.ts";
import {getCodeThemeById, loadAllCodeThemes, subscribeCodeThemes} from "./markdown/codeThemes.ts";
import {formatMarkdownImage, replaceMarkdownImageSizeByIndex} from "./markdown/imageMarkdown.ts";
import {formatVideoMaterialIframe, saveVideoMediaId, type MaterialVideo} from "./utils/publish.ts";
import {getActiveOutlineLine, parseMarkdownOutline} from "./utils/outline.ts";
import {loadAllThemes} from "./themes/loader.ts";
import {uploadImage, uploadLocalImage, type UploadError} from "./utils/upload.ts";
import {
  imageUploadTasks,
  listenForImageUploadProgress,
  type ImageUploadTask,
} from "./utils/imageUploadTasks.ts";
import {createScrollSync} from "./utils/syncScroll.ts";
import {createDocument, readDocument, writeDocument, type DocNode} from "./utils/documents.ts";
import {
  createBackgroundDocumentTarget,
  flushBackgroundDocumentOperations,
  releaseBackgroundDocumentTarget,
  registerBackgroundDocumentUpdater,
  updateDocumentInBackground,
  type BackgroundDocumentTarget,
} from "./utils/backgroundDocumentUpdates.ts";
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
import {Images, ListTree, PanelLeft} from "lucide-react";
import defaultContent from "./content.md?raw";
import {applyAppearanceMode} from "./appearance/appearanceMode.ts";
import {applyColorScheme} from "./appearance/colorScheme.ts";
import {applyBackgroundImage} from "./appearance/backgroundImage.ts";
import {isManualSyncShortcut} from "./utils/manualSyncShortcut.ts";
import {MOTION_DURATION_DRAWER, MOTION_EASE_OUT} from "./utils/motion.ts";

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

function StatusDivider() {
  return <span aria-hidden="true" className="h-3 w-px flex-none bg-border" />;
}

const uploadPhaseLabels: Record<ImageUploadTask["phase"], string> = {
  queued: "等待处理",
  reading: "读取文件",
  resolving: "解析路径",
  processing: "处理图片",
  downloading: "下载图片",
  preparing: "准备上传",
  compressing: "压缩中",
  uploading: "上传中",
  completed: "处理完成",
  failed: "处理失败",
};

function cleanUploadLabel(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim().slice(0, 120) || "图片";
}

function formatUploadSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(bytes >= 10 * 1024 * 1024 ? 1 : 2)} MiB`;
}

function formatUploadPlaceholder(task: ImageUploadTask): string {
  const sizes = task.originalSize
    ? task.outputSize && task.outputSize !== task.originalSize
      ? `，${formatUploadSize(task.originalSize)} → ${formatUploadSize(task.outputSize)}`
      : `，${formatUploadSize(task.originalSize)}`
    : "";
  return `\n<!-- vellum-upload:${task.id} -->\n> 图片处理中：${cleanUploadLabel(task.filename)}（${uploadPhaseLabels[task.phase]}${sizes}）\n`;
}

function formatUploadFailure(task: ImageUploadTask): string {
  const reason = cleanUploadLabel(task.error || "图片上传失败");
  return `\n> 图片上传失败：${cleanUploadLabel(task.filename)}（${reason}）\n`;
}

export default function App() {
  // 逐个 selector 订阅，避免任一 store 字段变化（如 tree、预览模式）
  // 都触发整个 App 树重渲染。
  const content = useStore((s) => s.content);
  const markdownThemeId = useStore((s) => s.markdownThemeId);
  const codeThemeId = useStore((s) => s.codeThemeId);
  const themes = useStore((s) => s.themes);
  const currentDocPath = useStore((s) => s.currentDocPath);
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const outlineOpen = useStore((s) => s.outlineOpen);
  const saveStatus = useStore((s) => s.saveStatus);
  const lastSavedAt = useStore((s) => s.lastSavedAt);
  const syncStatus = useStore((s) => s.syncStatus);
  const lastSyncedAt = useStore((s) => s.lastSyncedAt);
  const syncMessage = useStore((s) => s.syncMessage);
  const workspaceSplitRatio = useStore((s) => s.workspaceSplitRatio);
  const appearanceMode = useStore((s) => s.appearanceMode);
  const colorScheme = useStore((s) => s.colorScheme);
  const backgroundImagePath = useStore((s) => s.backgroundImagePath);
  const backgroundBlur = useStore((s) => s.backgroundBlur);
  const statusBarOpacity = useStore((s) => s.statusBarOpacity);
  const setAppearanceMode = useStore((s) => s.setAppearanceMode);
  const setColorScheme = useStore((s) => s.setColorScheme);
  const setBackgroundImagePath = useStore((s) => s.setBackgroundImagePath);
  const setBackgroundBlur = useStore((s) => s.setBackgroundBlur);
  const setStatusBarOpacity = useStore((s) => s.setStatusBarOpacity);
  const setContent = useStore((s) => s.setContent);
  const setThemes = useStore((s) => s.setThemes);
  const loadTree = useStore((s) => s.loadTree);
  const loadDocumentThemes = useStore((s) => s.loadDocumentThemes);
  const openDocument = useStore((s) => s.openDocument);
  const toggleSidebar = useStore((s) => s.toggleSidebar);
  const toggleOutline = useStore((s) => s.toggleOutline);
  const setWorkspaceSplitRatio = useStore((s) => s.setWorkspaceSplitRatio);
  useEffect(() => {
    applyAppearanceMode(appearanceMode, document.documentElement);
  }, [appearanceMode]);

  useEffect(() => {
    applyColorScheme(colorScheme, document.documentElement);
  }, [colorScheme]);

  useEffect(() => {
    applyBackgroundImage(backgroundImagePath, backgroundBlur, document.documentElement);
  }, [backgroundImagePath, backgroundBlur]);

  useEffect(() => registerBackgroundDocumentUpdater(async (documentPath, transform) => {
    const updateOpenDocument = (): boolean | null => {
      const state = useStore.getState();
      if (state.currentDocPath !== documentPath) return null;
      const next = transform(state.content);
      if (next === state.content) return false;
      state.setContent(next);
      return true;
    };

    const openResult = updateOpenDocument();
    if (openResult !== null) return openResult;
    await flushSave();
    const diskContent = await readDocument(documentPath);
    const becameOpenResult = updateOpenDocument();
    if (becameOpenResult !== null) return becameOpenResult;
    const next = transform(diskContent);
    if (next === diskContent) return false;
    await writeDocument(documentPath, next);
    return updateOpenDocument() ?? true;
  }), []);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
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
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [phoneUploadOpen, setPhoneUploadOpen] = useState(false);
  const [, setCodeThemesVersion] = useState(0);
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const previewRef = useRef<PreviewHandle>(null);
  useEffect(() => subscribeCodeThemes(() => setCodeThemesVersion((version) => version + 1)), []);
  // 后台预载全量代码主题（独立 chunk），选择器打开与非常驻主题预览无需等待。
  useEffect(() => {
    void loadAllCodeThemes().catch((error) => console.warn("加载代码主题失败：", error));
  }, []);
  const outlineItems = useMemo(() => parseMarkdownOutline(content), [content]);
  const reduceMotion = useReducedMotion();
  const drawerTransition = reduceMotion
    ? {duration: 0}
    : {duration: MOTION_DURATION_DRAWER, ease: MOTION_EASE_OUT};

  const inlineUploadsRef = useRef(new Map<string, {
    target: BackgroundDocumentTarget;
    placeholder: string;
  }>());

  const replaceInlineUpload = (
    taskId: string,
    replacement: string,
    finish = false,
  ) => {
    const upload = inlineUploadsRef.current.get(taskId);
    if (!upload) return;
    const previous = upload.placeholder;
    upload.placeholder = replacement;
    // 同步替换编辑器里的占位符（局部编辑，保留撤销历史），避免上传完成后
    // 触发整篇文档替换同步，导致 CodeMirror 滚动锚点归零、文章跳回开头。
    editorRef.current?.replaceUploadPlaceholder(taskId, replacement, finish);
    const update = updateDocumentInBackground(upload.target, (current) => {
      const position = current.indexOf(previous);
      if (position === -1) return current;
      return current.slice(0, position) + replacement + current.slice(position + previous.length);
    });
    if (finish) {
      inlineUploadsRef.current.delete(taskId);
      void update
        .finally(() => releaseBackgroundDocumentTarget(upload.target))
        .catch((error) => console.error("写回图片上传结果失败：", error));
    } else {
      void update.catch((error) => console.error("更新图片占位符失败：", error));
    }
  };

  useEffect(() => {
    const unsubscribeTasks = imageUploadTasks.subscribe(() => {
      for (const task of imageUploadTasks.getSnapshot()) {
        if (!inlineUploadsRef.current.has(task.id)) continue;
        if (task.status === "active") {
          replaceInlineUpload(task.id, formatUploadPlaceholder(task));
        } else if (task.status === "error") {
          replaceInlineUpload(task.id, formatUploadFailure(task), true);
        }
      }
    });

    let disposed = false;
    let unlisten: (() => void) | undefined;
    if (isTauriRuntime()) {
      void listenForImageUploadProgress()
        .then((cleanup) => {
          if (disposed) cleanup();
          else unlisten = cleanup;
        })
        .catch(() => undefined);
    }
    return () => {
      disposed = true;
      unsubscribeTasks();
      unlisten?.();
      for (const upload of inlineUploadsRef.current.values()) {
        releaseBackgroundDocumentTarget(upload.target);
      }
      inlineUploadsRef.current.clear();
    };
  }, []);

  const beginInlineUpload = (taskId: string) => {
    const task = imageUploadTasks.getSnapshot().find((item) => item.id === taskId);
    if (!task || !task.documentPath) return;
    const placeholder = formatUploadPlaceholder(task);
    inlineUploadsRef.current.set(taskId, {
      target: createBackgroundDocumentTarget(task.documentPath),
      placeholder,
    });
    editorRef.current?.insertUploadPlaceholder(taskId, placeholder);
  };

  const finishInlineUpload = (taskId: string, url: string) => {
    replaceInlineUpload(taskId, `\n${formatMarkdownImage({alt: "", url})}\n`, true);
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
    let taskId: string | null = null;
    try {
      const url = await uploadImage(
        file,
        (id) => {
          taskId = id;
          beginInlineUpload(id);
        },
        {documentPath: currentDocPath, documentTitle: currentDocPath?.split("/").pop()},
      );
      if (taskId) finishInlineUpload(taskId, url);
    } catch (e) {
      handleUploadError(e);
    }
  };

  const handleUploadLocal = async (path: string) => {
    let taskId: string | null = null;
    try {
      const url = await uploadLocalImage(
        path,
        "正文图片",
        (id) => {
          taskId = id;
          beginInlineUpload(id);
        },
        {documentPath: currentDocPath, documentTitle: currentDocPath?.split("/").pop()},
      );
      if (taskId) finishInlineUpload(taskId, url);
    } catch (e) {
      handleUploadError(e);
    }
  };

  const handleNeedSettings = useCallback(() => {
    setImageMaterialPickerOpen(false);
    setSettingsOpen(true);
  }, []);

  const handlePickMaterialImages = useCallback((urls: string[]) => {
    if (urls.length === 0) return;
    const markdown = urls.map((url) => formatMarkdownImage({alt: "", url})).join("\n\n");
    editorRef.current?.insertAtCursor(`\n${markdown}\n`);
  }, []);

  const handlePickMaterialImageFlow = useCallback((urls: string[]) => {
    if (urls.length === 0) return;
    const markdown = `<${urls.map((url) => formatMarkdownImage({alt: "", url})).join(",")}>`;
    editorRef.current?.insertBlockAtCursor(markdown);
  }, []);

  const handlePickMaterialVideos = useCallback((videos: MaterialVideo[]) => {
    if (videos.length === 0) return;
    for (const video of videos) {
      saveVideoMediaId(video.vid, video.mediaId);
    }
    const markdown = videos.map((video) => formatVideoMaterialIframe(video)).join("\n\n");
    editorRef.current?.insertAtCursor(`\n${markdown}\n`);
  }, []);

  const handlePickMaterialVoices = useCallback((markups: string[]) => {
    if (markups.length === 0) return;
    editorRef.current?.insertAtCursor(`\n${markups.join("\n\n")}\n`);
  }, []);

  const handlePickEmoji = useCallback((markdown: string) => {
    editorRef.current?.insertAtCursor(markdown);
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
  // setThemes 会根据当前文章记录解析本机可用主题；缺少自定义主题时只回退展示，
  // 不会覆盖随文档同步的原始主题选择。
  useEffect(() => {
    loadAllThemes().then((all) => {
      setThemes(all);
    });
  }, [setThemes]);

  // 启动：加载文档树和主题元数据；迁移旧 localStorage 草稿；决定打开哪篇。
  useEffect(() => {
    (async () => {
      await loadTree();
      await loadDocumentThemes();
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
        await flushBackgroundDocumentOperations();
        await flushSave();
        await flushDocumentThemeWrite();
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

  useEffect(() => {
    const handleManualSync = (event: KeyboardEvent) => {
      if (!isManualSyncShortcut(event)) return;
      event.preventDefault();
      if (event.repeat) return;
      void (async () => {
        await flushBackgroundDocumentOperations();
        await useStore.getState().runSyncNow();
      })().catch((error) => {
        console.error("主动保存并同步失败：", error);
      });
    };
    window.addEventListener("keydown", handleManualSync, true);
    return () => window.removeEventListener("keydown", handleManualSync, true);
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

  const lineCount = useMemo(() => (content ? content.split("\n").length : 0), [content]);
  const charCount = content.length;
  const startupReleaseNotes = availableUpdate?.body?.trim();

  return (
    <div style={{display: "flex", flexDirection: "column", height: "100%"}}>
      {/* Navbar */}
      <header className="relative z-50 flex h-[52px] flex-shrink-0 items-center justify-between gap-3 border-b border-border bg-transparent px-4">
        <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
          <IconButton variant="surface" active={sidebarOpen} title="文档" aria-pressed={sidebarOpen} onClick={toggleSidebar}>
            <PanelLeft size={16} />
          </IconButton>
          <IconButton variant="surface" active={outlineOpen} title="大纲" aria-pressed={outlineOpen} onClick={toggleOutline}>
            <ListTree size={16} />
          </IconButton>
          <span aria-hidden="true" className="h-5 w-px flex-none bg-border" />
          <IconButton
            variant="surface"
            active={imageMaterialPickerOpen}
            title="素材库"
            aria-pressed={imageMaterialPickerOpen}
            onClick={() => setImageMaterialPickerOpen(true)}
          >
            <Images size={16} />
          </IconButton>
        </div>
        <MainToolbar
          onOpenSettings={openSettings}
          onNeedSettings={openSettings}
          hasUpdateNotification={Boolean(availableUpdate)}
        />
      </header>

      {/* 主体：文档树 + 大纲 + 编辑器 + 预览 */}
      <main className="workspace-frame relative flex min-h-0 flex-1 gap-2 p-2.5">
        <AnimatePresence initial={false}>
          {sidebarOpen && (
            <motion.div
              key="documents"
              className="flex min-h-0 flex-none overflow-hidden"
              initial={{opacity: 0}}
              animate={{opacity: 1}}
              exit={{opacity: 0}}
              transition={drawerTransition}
            >
              <motion.div
                className="flex min-h-0"
                initial={{x: -24, opacity: 0}}
                animate={{x: 0, opacity: 1}}
                exit={{x: -24, opacity: 0}}
                transition={drawerTransition}
              >
                <DocTree />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        <AnimatePresence initial={false}>
          {outlineOpen && (
            <motion.div
              key="outline"
              className="flex min-h-0 flex-none overflow-hidden"
              initial={{opacity: 0}}
              animate={{opacity: 1}}
              exit={{opacity: 0}}
              transition={drawerTransition}
            >
              <motion.div
                className="flex min-h-0"
                initial={{x: -24, opacity: 0}}
                animate={{x: 0, opacity: 1}}
                exit={{x: -24, opacity: 0}}
                transition={drawerTransition}
              >
                <OutlineNav
                  items={outlineItems}
                  activeLine={activeOutlineLine}
                  onJump={handleOutlineJump}
                />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        <WorkspaceSplit
          ratio={workspaceSplitRatio}
          onRatioCommit={setWorkspaceSplitRatio}
          editor={
            <EditorWorkspacePanel
              editorRef={editorRef}
              onPickFile={handleUploadFile}
              onPickLocal={handleUploadLocal}
              onOpenEmoji={() => setEmojiPickerOpen(true)}
              onOpenPhoneUpload={() => setPhoneUploadOpen(true)}
              toolbarActions={<ArticleTaskLog currentDocumentPath={currentDocPath} />}
            >
              <MarkdownEditor
                ref={editorRef}
                value={content}
                documentKey={currentDocPath}
                appearanceMode={appearanceMode}
                onChange={setContent}
                onPasteImage={handleUploadFile}
              />
            </EditorWorkspacePanel>
          }
          preview={
            <div className="relative flex h-full min-h-0 min-w-0">
              <section
                aria-label="文章预览"
                data-workspace-panel="preview"
                tabIndex={-1}
                onPointerDown={(event) => event.currentTarget.focus({preventScroll: true})}
                className="workspace-panel workspace-preview-panel flex min-h-0 min-w-0 flex-1 overflow-hidden outline-none"
              >
                <div className="min-w-0 flex-1">
                  <Preview
                    ref={previewRef}
                    content={content}
                    markdownThemeId={markdownThemeId}
                    onResizeImage={handleResizePreviewImage}
                  />
                </div>
              </section>
            </div>
          }
        />
      </main>

      {/* Footer */}
      <footer
        className="flex h-7 flex-shrink-0 items-center justify-between gap-4 border-t border-border px-4 text-xs text-text-muted"
        style={{
          backgroundColor: `color-mix(in srgb, var(--bg) ${Math.round(statusBarOpacity * 100)}%, transparent)`,
        }}
      >
        <div className="flex min-w-0 items-center gap-2">
          {currentDocPath && (
            <>
              <span className="min-w-0 max-w-[260px] truncate">文档 {currentDocPath.split("/").pop()}</span>
              <StatusDivider />
            </>
          )}
          <span className="tabular-nums">行数 {lineCount}</span>
          <StatusDivider />
          <span className="tabular-nums">字数 {charCount}</span>
        </div>
        <div className="flex flex-none items-center gap-2">
          <span className="hidden items-center gap-2 lg:flex">
            <span>主题 {getThemeById(themes, markdownThemeId).name}</span>
            <StatusDivider />
          </span>
          <span className="hidden items-center gap-2 lg:flex">
            <span>代码 {getCodeThemeById(codeThemeId).name}</span>
            <StatusDivider />
          </span>
          <span className={saveStatus === "error" ? "text-danger" : ""}>{formatSaveStatus(saveStatus, lastSavedAt)}</span>
          <StatusDivider />
          <span className="hidden items-center gap-2 sm:flex">
            <span
              className={syncStatusClass(syncStatusTone(syncStatus))}
              title={syncMessage || undefined}
            >
              {formatCloudSyncStatus({status: syncStatus, lastSyncedAt, message: syncMessage})}
            </span>
            <StatusDivider />
          </span>
          <PreviewModeToggle variant="status" />
          <StatusDivider />
          <AppearanceToggle />
        </div>
      </footer>

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        updateState={updateState}
        appearanceMode={appearanceMode}
        colorScheme={colorScheme}
        backgroundImagePath={backgroundImagePath}
        backgroundBlur={backgroundBlur}
        statusBarOpacity={statusBarOpacity}
        onAppearanceModeChange={setAppearanceMode}
        onColorSchemeChange={setColorScheme}
        onBackgroundImageChange={setBackgroundImagePath}
        onBackgroundBlurChange={setBackgroundBlur}
        onStatusBarOpacityChange={setStatusBarOpacity}
      />
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
        canInsert={Boolean(currentDocPath)}
        onClose={() => setImageMaterialPickerOpen(false)}
        onPick={handlePickMaterialImages}
        onPickFlow={handlePickMaterialImageFlow}
        onPickVideos={handlePickMaterialVideos}
        onPickVoices={handlePickMaterialVoices}
        onNeedSettings={handleNeedSettings}
      />
      <EmojiPickerDialog
        open={emojiPickerOpen}
        canInsert={Boolean(currentDocPath)}
        onClose={() => setEmojiPickerOpen(false)}
        onPick={handlePickEmoji}
        onNeedSettings={handleNeedSettings}
      />
      <PhoneUploadDialog
        open={phoneUploadOpen}
        canInsert={Boolean(currentDocPath)}
        onClose={() => setPhoneUploadOpen(false)}
        onPick={handlePickEmoji}
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
