import {useCallback, useEffect, useLayoutEffect, useRef, useState} from "react";
import {useStore} from "../../store/index.ts";
import {solveDraftHtml} from "../../markdown/converter.ts";
import {waitForMathJaxIdle} from "../../markdown/mathjax.ts";
import {toProxyImageUrl} from "../../utils/imageProxy.ts";
import {
  addDraft,
  findUnuploadedImages,
  listImageMaterials,
  type MaterialImage,
  type UnuploadedImage,
  uploadThumb,
} from "../../utils/publish.ts";
import {
  loadPublishSettings,
  savePublishSettings,
  type CommentFlag,
} from "../../utils/publishSettings.ts";
import {toast} from "../Toast/toast.ts";
import {FileText, Globe2, ImageIcon, Library, Loader2, MessageCircle, MessageCircleOff, RefreshCw, UploadCloud, UserRound, Users} from "lucide-react";
import Dialog from "../ui/Dialog.tsx";
import Button, {type ButtonState} from "../ui/Button.tsx";
import UnuploadedImagesWarning from "./UnuploadedImagesWarning.tsx";

interface Props {
  open: boolean;
  onClose: () => void;
  onNeedSettings: () => void;
}

const MATERIAL_PAGE_SIZE = 20;
const PUBLISH_TRIGGER_ID = "publish-dialog-submit";

interface ImageWarningState {
  contentSnapshot: string;
  diagnostics: UnuploadedImage[];
}

const titleInputShellClass =
  "group box-border flex h-11 items-center gap-2 rounded-lg border-2 border-solid border-[#b8baca] bg-bg-secondary px-3.5 text-text-muted shadow-[inset_0_1px_0_rgba(255,255,255,0.78),0_8px_22px_rgba(20,20,30,0.045)] transition-all duration-fast ease-smooth hover:border-[#9ea2b8] hover:bg-bg focus-within:border-[rgba(94,106,210,0.5)] focus-within:bg-bg focus-within:shadow-[inset_0_1px_0_rgba(255,255,255,0.86),0_0_0_3px_rgba(94,106,210,0.10),0_10px_24px_rgba(20,20,30,0.06)]";

const titleInputClass =
  "h-full min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 font-[inherit] text-[15px] text-text outline-none placeholder:text-text-muted";

const segmentedButtonClass = (active: boolean) =>
  `inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md border px-2.5 text-[13px] font-semibold outline-none transition-all duration-fast ease-smooth focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] ${
    active
      ? "border-[rgba(94,106,210,0.42)] bg-bg text-accent shadow-[0_8px_18px_rgba(94,106,210,0.12)]"
      : "border-transparent bg-transparent text-text-secondary hover:bg-bg hover:text-text"
  }`;

function revokePreview(url: string | null) {
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
}

function mergeMaterialItems(existing: MaterialImage[], incoming: MaterialImage[]): MaterialImage[] {
  const seen = new Set(existing.map((item) => item.mediaId));
  const merged = [...existing];
  for (const item of incoming) {
    if (seen.has(item.mediaId)) continue;
    seen.add(item.mediaId);
    merged.push(item);
  }
  return merged;
}

function formatMaterialTime(value: number): string {
  if (!value) return "未知时间";
  return new Date(value * 1000).toLocaleDateString("zh-CN");
}

export default function PublishDialog({open, onClose, onNeedSettings}: Props) {
  const currentDocPath = useStore((s) => s.currentDocPath);
  const defaultTitle = currentDocPath
    ? currentDocPath.split("/").pop()!.replace(/\.md$/, "")
    : "未命名";
  const [title, setTitle] = useState(defaultTitle);
  const [author, setAuthor] = useState("");
  const [needOpenComment, setNeedOpenComment] = useState<CommentFlag>(0);
  const [onlyFansCanComment, setOnlyFansCanComment] = useState<CommentFlag>(0);
  const [thumbId, setThumbId] = useState<string | null>(null);
  const [thumbPreview, setThumbPreview] = useState<string | null>(null);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  const [materialItems, setMaterialItems] = useState<MaterialImage[]>([]);
  const [materialTotal, setMaterialTotal] = useState(0);
  const [materialLoaded, setMaterialLoaded] = useState(false);
  const [materialLoading, setMaterialLoading] = useState(false);
  const [materialError, setMaterialError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [thumbUploading, setThumbUploading] = useState(false);
  // 发布结果态只由正式发布动作推导，封面上传使用独立的局部 loading。
  const [pubResult, setPubResult] = useState<"none" | "ok" | "fail">("none");
  const [imageWarning, setImageWarning] = useState<ImageWarningState | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<string | null>(null);
  const materialLoadingRef = useRef(false);
  const sessionRef = useRef(0);
  const mountedRef = useRef(true);
  const nextOperationIdRef = useRef(0);
  const nextThumbUploadIdRef = useRef(0);
  const publishingRef = useRef<{id: number; session: number} | null>(null);
  const terminalTimeoutRef = useRef<number | null>(null);
  const warningBackButtonRef = useRef<HTMLButtonElement>(null);
  const restorePublishFocusRef = useRef(false);
  const [materialPanelHeight, setMaterialPanelHeight] = useState<number | null>(null);
  const commentsEnabled = needOpenComment === 1;
  previewRef.current = thumbPreview;

  const clearTerminalTimeout = useCallback(() => {
    if (terminalTimeoutRef.current === null) return;
    window.clearTimeout(terminalTimeoutRef.current);
    terminalTimeoutRef.current = null;
  }, []);

  const loadMaterialLibrary = useCallback(async (offset = 0) => {
    if (materialLoadingRef.current) return;
    materialLoadingRef.current = true;
    setMaterialLoading(true);
    setMaterialError(null);
    try {
      const page = await listImageMaterials(offset, MATERIAL_PAGE_SIZE);
      setMaterialTotal(page.totalCount);
      setMaterialItems((prev) => (offset === 0 ? page.items : mergeMaterialItems(prev, page.items)));
    } catch (e) {
      const msg = String(e);
      setMaterialError(msg);
      if (msg.includes("NOT_CONFIGURED")) {
        toast.show("尚未配置微信图床，请先在设置中填写", "error");
        onNeedSettings();
      } else {
        toast.show(`素材库读取失败：${msg}`, "error");
      }
    } finally {
      setMaterialLoaded(true);
      materialLoadingRef.current = false;
      setMaterialLoading(false);
    }
  }, [onNeedSettings]);

  useEffect(() => {
    clearTerminalTimeout();
    sessionRef.current += 1;
    nextThumbUploadIdRef.current += 1;
    if (!open) {
      restorePublishFocusRef.current = false;
      setImageWarning(null);
      return;
    }
    const publishSettings = loadPublishSettings();
    setTitle(defaultTitle);
    setAuthor(publishSettings.author);
    setNeedOpenComment(publishSettings.needOpenComment);
    setOnlyFansCanComment(publishSettings.needOpenComment === 1 ? publishSettings.onlyFansCanComment : 0);
    setThumbId(null);
    setSelectedMaterialId(null);
    setMaterialItems([]);
    setMaterialTotal(0);
    setMaterialLoaded(false);
    materialLoadingRef.current = false;
    setMaterialLoading(false);
    setMaterialError(null);
    setThumbPreview((prev) => {
      revokePreview(prev);
      return null;
    });
    setBusy(publishingRef.current !== null);
    setThumbUploading(false);
    setPubResult("none");
    restorePublishFocusRef.current = false;
    setImageWarning(null);
    if (fileRef.current) fileRef.current.value = "";
    // 打开弹窗时自动加载素材库
    void loadMaterialLibrary(0);
  }, [open, defaultTitle, clearTerminalTimeout]);

  useLayoutEffect(() => {
    if (!open) return;
    if (imageWarning) {
      warningBackButtonRef.current?.focus();
      return;
    }
    if (restorePublishFocusRef.current) {
      restorePublishFocusRef.current = false;
      document.getElementById(PUBLISH_TRIGGER_ID)?.focus();
    }
  }, [imageWarning, open]);

  // 弹窗卸载时释放最后的预览 blob URL。
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      sessionRef.current += 1;
      nextThumbUploadIdRef.current += 1;
      clearTerminalTimeout();
      revokePreview(previewRef.current);
    };
  }, [clearTerminalTimeout]);

  useLayoutEffect(() => {
    if (!open || typeof window.matchMedia !== "function") {
      setMaterialPanelHeight(null);
      return;
    }

    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    let frame = 0;

    const updateMaterialPanelHeight = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (!mediaQuery.matches || !leftPanelRef.current) {
          setMaterialPanelHeight(null);
          return;
        }

        const nextHeight = Math.max(360, Math.ceil(leftPanelRef.current.getBoundingClientRect().height));
        setMaterialPanelHeight((prev) => (prev === nextHeight ? prev : nextHeight));
      });
    };

    updateMaterialPanelHeight();
    const settleTimer = window.setTimeout(updateMaterialPanelHeight, 180);

    const resizeObserver =
      typeof ResizeObserver === "function" ? new ResizeObserver(updateMaterialPanelHeight) : null;
    if (resizeObserver) {
      if (leftPanelRef.current) resizeObserver.observe(leftPanelRef.current);
    }

    window.addEventListener("resize", updateMaterialPanelHeight);
    mediaQuery.addEventListener("change", updateMaterialPanelHeight);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(settleTimer);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateMaterialPanelHeight);
      mediaQuery.removeEventListener("change", updateMaterialPanelHeight);
    };
  }, [open]);

  const pickThumb = async (file: File) => {
    const operation = {id: ++nextThumbUploadIdRef.current, session: sessionRef.current};
    const isCurrentOperation = () =>
      mountedRef.current &&
      sessionRef.current === operation.session &&
      nextThumbUploadIdRef.current === operation.id;
    setThumbUploading(true);
    try {
      const id = await uploadThumb(file);
      if (!isCurrentOperation()) return;
      setThumbId(id);
      setSelectedMaterialId(null);
      setThumbPreview((prev) => {
        revokePreview(prev);
        return URL.createObjectURL(file);
      });
    } catch (e) {
      if (isCurrentOperation()) handleThumbError(e);
    } finally {
      if (isCurrentOperation()) setThumbUploading(false);
    }
  };

  const pickMaterialThumb = (item: MaterialImage) => {
    if (busy || thumbUploading) return;
    setThumbId(item.mediaId);
    setSelectedMaterialId(item.mediaId);
    setThumbPreview((prev) => {
      revokePreview(prev);
      return toProxyImageUrl(item.url);
    });
    toast.show("已选择素材库图片作为封面", "info");
  };

  const handleThumbError = (error: unknown) => {
    const msg = String(error);
    if (msg.includes("NOT_CONFIGURED")) {
      toast.show("尚未配置微信图床，请先在设置中填写", "error");
      onNeedSettings();
    } else {
      toast.show(`封面上传失败：${msg}`, "error");
    }
  };

  const clearImageWarning = (restorePublishFocus = false) => {
    restorePublishFocusRef.current = restorePublishFocus;
    setImageWarning(null);
  };

  const handleClose = () => {
    clearTerminalTimeout();
    restorePublishFocusRef.current = false;
    setImageWarning(null);
    onClose();
  };

  const executePublish = async () => {
    if (!title.trim()) {
      toast.show("请填写标题", "error");
      return;
    }
    if (!thumbId) {
      toast.show("请选择封面图", "error");
      return;
    }
    if (publishingRef.current) return;

    clearTerminalTimeout();
    const operation = {id: ++nextOperationIdRef.current, session: sessionRef.current};
    publishingRef.current = operation;
    const isCurrentSession = () =>
      mountedRef.current && sessionRef.current === operation.session;
    const isCurrentOperationGeneration = () =>
      isCurrentSession() && nextOperationIdRef.current === operation.id;
    setBusy(true);
    setPubResult("none");
    try {
      await waitForMathJaxIdle();
      if (!isCurrentSession()) return;

      const html = solveDraftHtml();
      const publishSettings = {
        author: author.trim(),
        needOpenComment,
        onlyFansCanComment: commentsEnabled ? onlyFansCanComment : 0,
      };
      savePublishSettings(publishSettings);
      await addDraft(title.trim(), html, thumbId, publishSettings);
      if (!isCurrentSession()) return;

      restorePublishFocusRef.current = false;
      setImageWarning(null);
      // 成功：先就地显示成功态，再关窗 + 提示，给用户一个明确的"发成了"反馈
      setPubResult("ok");
      const successTimeout = window.setTimeout(() => {
        if (
          terminalTimeoutRef.current !== successTimeout ||
          !isCurrentOperationGeneration()
        ) return;
        terminalTimeoutRef.current = null;
        toast.show("已发到公众号草稿箱，请在后台确认排版后发送", "info", 4000);
        handleClose();
      }, 900);
      terminalTimeoutRef.current = successTimeout;
    } catch (e) {
      if (!isCurrentSession()) return;

      restorePublishFocusRef.current = false;
      setImageWarning(null);
      setPubResult("fail");
      toast.show(`发布失败：${String(e)}`, "error");
      const failureTimeout = window.setTimeout(() => {
        if (
          terminalTimeoutRef.current !== failureTimeout ||
          !isCurrentOperationGeneration()
        ) return;
        terminalTimeoutRef.current = null;
        setPubResult("none");
      }, 2000);
      terminalTimeoutRef.current = failureTimeout;
    } finally {
      if (publishingRef.current?.id === operation.id) {
        publishingRef.current = null;
        if (mountedRef.current) setBusy(false);
      }
    }
  };

  const requestPublish = () => {
    if (thumbUploading) return;
    const contentSnapshot = useStore.getState().content;
    const diagnostics = findUnuploadedImages(contentSnapshot);
    if (diagnostics.length > 0) {
      setImageWarning({contentSnapshot, diagnostics});
      return;
    }
    void executePublish();
  };

  const continuePublish = () => {
    if (!imageWarning || publishingRef.current !== null) return;
    const latestContent = useStore.getState().content;
    if (latestContent !== imageWarning.contentSnapshot) {
      const diagnostics = findUnuploadedImages(latestContent);
      if (diagnostics.length > 0) {
        setImageWarning({contentSnapshot: latestContent, diagnostics});
      } else {
        clearImageWarning(true);
      }
      return;
    }
    void executePublish();
  };

  // 发布按钮态：busy 时 loading（成功窗口期 busy 已 false 但 pubResult=ok 显示 success）
  const publishState: ButtonState =
    pubResult === "ok" ? "success" : pubResult === "fail" ? "error" : busy ? "loading" : "idle";

  const openThumbPicker = () => {
    if (busy || thumbUploading) return;
    if (fileRef.current) {
      fileRef.current.value = "";
      fileRef.current.click();
    }
  };

  return (
    <>
      <Dialog
        open={open}
        title={imageWarning ? "未上传图片检查" : "发布到公众号草稿箱"}
        onClose={handleClose}
        closeOnOverlay={false}
        closeDisabled={busy}
        width="min(86vw,1040px)"
        footer={imageWarning ? undefined : (
          <>
            <Button type="button" variant="secondary" disabled={busy} onClick={handleClose}>
              取消
            </Button>
            <Button
              id={PUBLISH_TRIGGER_ID}
              type="button"
              variant="primary"
              state={publishState}
              disabled={pubResult === "ok" || !thumbId || thumbUploading}
              loadingText="发布中…"
              successText="已发布"
              errorText="发布失败"
              onClick={requestPublish}
            >
              发布到草稿箱
            </Button>
          </>
        )}
      >
        {imageWarning ? (
          <UnuploadedImagesWarning
            items={imageWarning.diagnostics}
            busy={busy}
            onBack={() => clearImageWarning(true)}
            onContinue={continuePublish}
            backButtonRef={warningBackButtonRef}
          />
        ) : (
      <div className="grid min-h-0 items-start gap-5 lg:grid-cols-[minmax(340px,0.95fr)_minmax(0,1.05fr)]">
        <div
          ref={leftPanelRef}
          className="flex min-w-0 flex-col gap-4 rounded border border-border bg-[linear-gradient(180deg,#fff_0%,#fbfbfd_100%)] p-4 shadow-sm"
        >
          <div>
            <label htmlFor="publish-title" className="mb-2 block text-[13px] font-medium text-text-secondary">
              文章标题
            </label>
            <div className={titleInputShellClass}>
              <FileText size={16} className="flex-none transition-colors duration-fast group-focus-within:text-accent" />
              <input
                id="publish-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={titleInputClass}
                placeholder="输入公众号文章标题"
              />
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label htmlFor="publish-author" className="mb-2 block text-[13px] font-medium text-text-secondary">
                作者
              </label>
              <div className={titleInputShellClass}>
                <UserRound size={16} className="flex-none transition-colors duration-fast group-focus-within:text-accent" />
                <input
                  id="publish-author"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  className={titleInputClass}
                  placeholder="可留空"
                />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <fieldset className="m-0 min-w-0 border-0 p-0">
                <legend className="mb-2 block text-[13px] font-medium text-text-secondary">评论</legend>
                <div className="flex rounded-lg border border-border bg-bg-secondary p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
                  <button
                    type="button"
                    aria-pressed={needOpenComment === 0}
                    onClick={() => {
                      setNeedOpenComment(0);
                      setOnlyFansCanComment(0);
                    }}
                    className={segmentedButtonClass(needOpenComment === 0)}
                  >
                    <MessageCircleOff size={15} />
                    关闭
                  </button>
                  <button
                    type="button"
                    aria-pressed={needOpenComment === 1}
                    onClick={() => setNeedOpenComment(1)}
                    className={segmentedButtonClass(needOpenComment === 1)}
                  >
                    <MessageCircle size={15} />
                    打开
                  </button>
                </div>
              </fieldset>

              <fieldset className="m-0 min-w-0 border-0 p-0">
                <legend className="mb-2 block text-[13px] font-medium text-text-secondary">评论范围</legend>
                <div
                  className={`flex rounded-lg border border-border bg-bg-secondary p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)] transition-opacity duration-fast ${
                    commentsEnabled ? "opacity-100" : "opacity-55"
                  }`}
                >
                  <button
                    type="button"
                    aria-pressed={onlyFansCanComment === 0}
                    disabled={!commentsEnabled}
                    onClick={() => setOnlyFansCanComment(0)}
                    className={`${segmentedButtonClass(onlyFansCanComment === 0)} disabled:cursor-default`}
                  >
                    <Globe2 size={15} />
                    所有人
                  </button>
                  <button
                    type="button"
                    aria-pressed={onlyFansCanComment === 1}
                    disabled={!commentsEnabled}
                    onClick={() => setOnlyFansCanComment(1)}
                    className={`${segmentedButtonClass(onlyFansCanComment === 1)} disabled:cursor-default`}
                  >
                    <Users size={15} />
                    粉丝
                  </button>
                </div>
              </fieldset>
            </div>
          </div>

          <div className="flex flex-col">
            <div className="mb-2 flex items-end justify-between gap-3">
              <div>
                <label htmlFor="publish-thumb" className="block text-[13px] font-medium text-text">
                  封面图
                </label>
                <div className="mt-1 text-xs text-text-muted">建议使用2.35:1的清晰横图；点击封面可从本地上传</div>
              </div>
              {thumbPreview && <span className="text-xs font-medium text-accent">已选择</span>}
            </div>
            <input
              id="publish-thumb"
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/gif"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void pickThumb(f);
              }}
            />
            <div className="rounded-[10px] p-[2px]">
            <button
              type="button"
              onClick={openThumbPicker}
              disabled={busy || thumbUploading}
              aria-label={thumbUploading ? "封面图上传中" : thumbPreview ? "更换封面图" : "上传封面图"}
              aria-busy={thumbUploading}
              className={`group relative flex aspect-[2.35/1] w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg bg-bg-secondary text-left outline-none transition-all duration-fast ease-smooth focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:cursor-default disabled:opacity-60 ${
                thumbPreview
                  ? "border border-border shadow-[0_1px_2px_rgba(0,0,0,0.04),0_3px_10px_rgba(0,0,0,0.05)]"
                  : "border border-dashed border-border-strong hover:border-[rgba(94,106,210,0.5)] hover:bg-accent-subtle"
              }`}
            >
              {thumbUploading ? (
                <div role="status" className="flex flex-col items-center px-6 text-center text-accent">
                  <Loader2 size={26} className="animate-spin" />
                  <div className="mt-2 text-sm font-semibold">封面上传中…</div>
                </div>
              ) : thumbPreview ? (
                <>
                  <img src={thumbPreview} alt="已选择的封面图预览" className="absolute inset-0 h-full w-full object-cover" />
                  <span className="absolute right-2 top-2 inline-flex h-8 items-center gap-1.5 rounded-md bg-bg/95 px-2.5 text-[12px] font-medium text-text shadow-sm transition-colors group-hover:bg-bg">
                    <UploadCloud size={14} />
                    更换
                  </span>
                </>
              ) : (
                <div className="flex flex-col items-center px-6 text-center">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent-subtle text-accent transition-transform duration-fast group-hover:scale-105">
                    <ImageIcon size={22} />
                  </span>
                  <div className="mt-3 text-sm font-semibold text-text">点击上传封面图</div>
                  <div className="mt-1 text-xs leading-5 text-text-secondary">用一张横向图片作为草稿箱封面</div>
                </div>
              )}
            </button>
            </div>
          </div>
        </div>

        <div
          className="box-border flex min-h-0 min-w-0 flex-col overflow-hidden rounded border border-border bg-[linear-gradient(180deg,#fff_0%,#fbfbfd_100%)] p-4 shadow-sm"
          style={{height: materialPanelHeight ? `${materialPanelHeight}px` : undefined}}
        >
          <div className="mb-3 flex flex-none flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-0.5">
              <h3 className="flex items-center gap-1.5 text-[14px] font-semibold text-text">
                <Library size={16} />
                素材库选择
              </h3>
              <span className="text-xs text-text-muted">已上传的正文图片和历史封面都在这里，点击即可选择</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-muted">
                {materialLoaded
                  ? `${materialItems.length}/${materialTotal || materialItems.length} 张`
                  : "加载中…"}
              </span>
              <button
                type="button"
                title="刷新素材库"
                aria-label="刷新素材库"
                disabled={busy || thumbUploading || materialLoading}
                onClick={() => void loadMaterialLibrary(0)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-border bg-bg-secondary text-text-secondary outline-none transition-colors duration-fast hover:bg-bg-tertiary hover:text-text focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:cursor-default disabled:opacity-50"
              >
                <RefreshCw size={14} className={materialLoading ? "animate-spin" : ""} />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1">
            {materialLoading && materialItems.length === 0 ? (
              <div
                className="grid h-full auto-rows-max grid-cols-2 gap-2 overflow-hidden py-[5px] pl-[4px] pr-2 xl:grid-cols-3"
                aria-label="素材库加载中"
              >
                {Array.from({length: 6}).map((_, index) => (
                  <div
                    key={index}
                    className="aspect-[2.35/1] animate-pulse overflow-hidden rounded-md border border-border shadow-[0_1px_2px_rgba(0,0,0,0.04),0_2px_8px_rgba(0,0,0,0.04)] bg-bg-secondary p-2"
                  >
                    <div className="h-full rounded bg-[linear-gradient(90deg,rgba(148,163,184,0.10),rgba(148,163,184,0.22),rgba(148,163,184,0.10))]" />
                  </div>
                ))}
              </div>
            ) : materialError && materialItems.length === 0 ? (
              <div className="rounded-md bg-bg-secondary px-3 py-3 text-xs leading-5 text-text-secondary">
                <div className="font-medium text-text">素材库读取失败</div>
                <div className="mt-1 break-words">
                  {materialError.includes("NOT_CONFIGURED") ? "请先在设置中填写微信素材上传凭证。" : materialError}
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-3"
                  disabled={materialLoading}
                  onClick={() => void loadMaterialLibrary(0)}
                >
                  重试
                </Button>
              </div>
            ) : materialItems.length > 0 ? (
              <div className="flex h-full flex-col">
                <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable_both-edges] [scrollbar-width:thin] py-[5px] pl-[4px] pr-2">
                  <div className="grid auto-rows-max grid-cols-2 gap-2 content-start xl:grid-cols-3">
                    {materialItems.map((item, index) => {
                    const selected = selectedMaterialId === item.mediaId;
                    return (
                      <button
                        key={item.mediaId}
                        type="button"
                        disabled={busy || thumbUploading}
                        onClick={() => pickMaterialThumb(item)}
                        className={`group relative block aspect-[2.35/1] w-full appearance-none overflow-hidden rounded-md border bg-bg-secondary p-0 outline-none transition-all duration-fast hover:-translate-y-px hover:border-accent/60 focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:cursor-default disabled:opacity-60 ${
                          selected ? "border-accent/70 shadow-[0_0_0_2px_var(--ring),0_4px_14px_rgba(94,106,210,0.16)] hover:shadow-[0_0_0_2px_var(--ring),0_6px_20px_rgba(94,106,210,0.22)]" : "border border-border shadow-[0_1px_2px_rgba(0,0,0,0.04),0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.05),0_8px_20px_rgba(0,0,0,0.05)]"
                        }`}
                        aria-label={`选择素材库第 ${index + 1} 张图片作为封面：${item.name}`}
                      >
                        <img
                          src={toProxyImageUrl(item.url)}
                          alt={`素材库候选封面：${item.name}`}
                          className="block h-full w-full object-cover transition-transform duration-fast group-hover:scale-105"
                        />
                        <span className="absolute inset-x-0 bottom-0 bg-black/55 px-2 py-1 text-left text-[11px] leading-4 text-white/90 opacity-0 transition-opacity group-hover:opacity-100">
                          <span className="block truncate">{item.name}</span>
                          <span className="block text-white/70">{formatMaterialTime(item.updateTime)}</span>
                        </span>
                        {selected && (
                          <span className="absolute right-1.5 top-1.5 rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-white shadow-sm">
                            已选
                          </span>
                        )}
                      </button>
                    );
                  })}
                  </div>
                </div>
                <div className="mt-3 flex flex-none items-center justify-between gap-3">
                  <span className="text-xs text-text-muted">
                    {materialTotal > 0 ? `共 ${materialTotal} 张图片素材` : "已显示素材库图片"}
                  </span>
                  {materialItems.length < materialTotal && (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={busy || thumbUploading || materialLoading}
                      onClick={() => void loadMaterialLibrary(materialItems.length)}
                    >
                      {materialLoading ? "加载中…" : "加载更多"}
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-md bg-bg-secondary px-3 py-3 text-xs leading-5 text-text-secondary">
                素材库暂无图片素材。上传过的正文图片会进入这里，后续发布同系列文章时可以直接复用。
              </div>
            )}
          </div>
        </div>
      </div>
        )}
    </Dialog>
    </>
  );
}
