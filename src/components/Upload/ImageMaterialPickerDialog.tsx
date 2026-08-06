import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {
  Check,
  CheckSquare2,
  Clapperboard,
  Film,
  ImageIcon,
  Images,
  ImageUp,
  MoveHorizontal,
  RefreshCw,
  Square,
  Trash2,
} from "lucide-react";
import {toProxyImageUrl} from "../../utils/imageProxy.ts";
import {
  deleteImageMaterial,
  listImageMaterials,
  listVideoMaterials,
  type MaterialImage,
  type MaterialVideo,
} from "../../utils/publish.ts";
import {pickImageFiles, uploadLocalImage} from "../../utils/upload.ts";
import {toast} from "../Toast/toast.ts";
import Button from "../ui/Button.tsx";
import Dialog from "../ui/Dialog.tsx";
import DeleteMaterialConfirmDialog from "./DeleteMaterialConfirmDialog.tsx";
import {runMaterialOperations} from "./materialBatch.ts";

interface Props {
  open: boolean;
  canInsert: boolean;
  onClose: () => void;
  onPick: (urls: string[]) => void;
  onPickFlow: (urls: string[]) => void;
  onPickVideos?: (videos: MaterialVideo[]) => void;
  onNeedSettings: () => void;
}

type MaterialTab = "image" | "video";

const MATERIAL_PAGE_SIZE = 20;
const DELETE_CONCURRENCY = 4;
const UPLOAD_CONCURRENCY = 16;
const IMAGE_FLOW_LIMIT = 10;

function mergeMaterialItems<T extends {mediaId: string}>(existing: T[], incoming: T[]): T[] {
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

function errorMessage(error: unknown): string {
  return typeof error === "string" ? error : (error as Error)?.message || "未知错误";
}

export default function ImageMaterialPickerDialog({open, canInsert, onClose, onPick, onPickFlow, onPickVideos, onNeedSettings}: Props) {
  const [tab, setTab] = useState<MaterialTab>("image");
  const [materialItems, setMaterialItems] = useState<MaterialImage[]>([]);
  const [materialTotal, setMaterialTotal] = useState(0);
  const [materialLoading, setMaterialLoading] = useState(false);
  const [materialError, setMaterialError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [videoItems, setVideoItems] = useState<MaterialVideo[]>([]);
  const [videoTotal, setVideoTotal] = useState(0);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [videoSelectedIds, setVideoSelectedIds] = useState<Set<string>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteCompleted, setDeleteCompleted] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({completed: 0, total: 0});
  const materialLoadingRef = useRef(false);
  const videoLoadingRef = useRef(false);
  const librarySessionRef = useRef(0);

  const selectedItems = useMemo(
    () => materialItems.filter((item) => selectedIds.has(item.mediaId)),
    [materialItems, selectedIds],
  );

  const selectedVideos = useMemo(
    () => videoItems.filter((item) => videoSelectedIds.has(item.mediaId)),
    [videoItems, videoSelectedIds],
  );

  const loadMaterialLibrary = useCallback(async (offset = 0, session = librarySessionRef.current) => {
    if (materialLoadingRef.current) return;
    materialLoadingRef.current = true;
    setMaterialLoading(true);
    setMaterialError(null);
    try {
      const page = await listImageMaterials(offset, MATERIAL_PAGE_SIZE);
      if (session !== librarySessionRef.current) return;
      setMaterialTotal(page.totalCount);
      setMaterialItems((prev) => (offset === 0 ? page.items : mergeMaterialItems(prev, page.items)));
      if (offset === 0) setSelectedIds(new Set());
    } catch (error) {
      if (session !== librarySessionRef.current) return;
      const message = errorMessage(error);
      setMaterialError(message);
      if (message.includes("NOT_CONFIGURED")) {
        toast.show("尚未配置微信图床，请先在设置中填写", "error");
        onNeedSettings();
      } else {
        toast.show(`素材库读取失败：${message}`, "error");
      }
    } finally {
      if (session === librarySessionRef.current) {
        materialLoadingRef.current = false;
        setMaterialLoading(false);
      }
    }
  }, [onNeedSettings]);

  const loadVideoLibrary = useCallback(async (offset = 0, session = librarySessionRef.current) => {
    if (videoLoadingRef.current) return;
    videoLoadingRef.current = true;
    setVideoLoading(true);
    setVideoError(null);
    try {
      const page = await listVideoMaterials(offset, MATERIAL_PAGE_SIZE);
      if (session !== librarySessionRef.current) return;
      setVideoTotal(page.totalCount);
      setVideoItems((prev) => (offset === 0 ? page.items : mergeMaterialItems(prev, page.items)));
      if (offset === 0) setVideoSelectedIds(new Set());
    } catch (error) {
      if (session !== librarySessionRef.current) return;
      const message = errorMessage(error);
      setVideoError(message);
      if (message.includes("NOT_CONFIGURED")) {
        toast.show("尚未配置微信素材凭证，请先在设置中填写", "error");
        onNeedSettings();
      } else {
        toast.show(`素材库读取失败：${message}`, "error");
      }
    } finally {
      if (session === librarySessionRef.current) {
        videoLoadingRef.current = false;
        setVideoLoading(false);
      }
    }
  }, [onNeedSettings]);

  useEffect(() => {
    const session = ++librarySessionRef.current;
    materialLoadingRef.current = false;
    videoLoadingRef.current = false;
    if (!open) return;
    setTab("image");
    setMaterialItems([]);
    setMaterialTotal(0);
    setMaterialLoading(false);
    setMaterialError(null);
    setSelectedIds(new Set());
    setVideoItems([]);
    setVideoTotal(0);
    setVideoLoading(false);
    setVideoError(null);
    setVideoSelectedIds(new Set());
    setDeleteConfirmOpen(false);
    setDeleting(false);
    setDeleteCompleted(0);
    setUploading(false);
    setUploadProgress({completed: 0, total: 0});
    void loadMaterialLibrary(0, session);
  }, [open, loadMaterialLibrary]);

  const switchTab = (next: MaterialTab) => {
    setTab(next);
    if (next === "video" && videoItems.length === 0 && !videoLoadingRef.current) {
      void loadVideoLibrary(0);
    }
  };

  const toggleSelection = (mediaId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(mediaId)) next.delete(mediaId);
      else next.add(mediaId);
      return next;
    });
  };

  const toggleSelectAllLoaded = () => {
    setSelectedIds((current) => current.size === materialItems.length
      ? new Set()
      : new Set(materialItems.map((item) => item.mediaId)));
  };

  const toggleVideoSelection = (mediaId: string) => {
    setVideoSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(mediaId)) next.delete(mediaId);
      else next.add(mediaId);
      return next;
    });
  };

  const toggleSelectAllVideos = () => {
    setVideoSelectedIds((current) => current.size === videoItems.length
      ? new Set()
      : new Set(videoItems.map((item) => item.mediaId)));
  };

  const insertSelected = () => {
    if (!canInsert || selectedItems.length === 0) return;
    onPick(selectedItems.map((item) => item.url));
    toast.show(`已插入 ${selectedItems.length} 张素材库图片`, "info");
    onClose();
  };

  const insertFlow = () => {
    if (!canInsert || selectedItems.length < 2) return;
    if (selectedItems.length > IMAGE_FLOW_LIMIT) {
      toast.show(`横滑组最多支持 ${IMAGE_FLOW_LIMIT} 张图片，请减少选择数量`, "error");
      return;
    }
    onPickFlow(selectedItems.map((item) => item.url));
    toast.show(`已插入 ${selectedItems.length} 张横滑图片`, "info");
    onClose();
  };

  const insertSelectedVideos = () => {
    if (!canInsert || selectedVideos.length === 0) return;
    onPickVideos?.(selectedVideos);
    toast.show(`已插入 ${selectedVideos.length} 个素材库视频`, "info");
    onClose();
  };

  const confirmDelete = async () => {
    if (deleting || selectedItems.length === 0) return;
    const itemsToDelete = [...selectedItems];
    setDeleting(true);
    setDeleteCompleted(0);
    const results = await runMaterialOperations(
      itemsToDelete,
      DELETE_CONCURRENCY,
      (item) => deleteImageMaterial(item.mediaId),
      (completed) => setDeleteCompleted(completed),
    );
    const succeeded = results.filter((result) => result.error === undefined).map((result) => result.item);
    const failed = results.filter((result) => result.error !== undefined);
    const succeededIds = new Set(succeeded.map((item) => item.mediaId));
    setMaterialItems((current) => current.filter((item) => !succeededIds.has(item.mediaId)));
    setMaterialTotal((current) => Math.max(0, current - succeeded.length));
    setSelectedIds(new Set(failed.map((result) => result.item.mediaId)));
    setDeleting(false);
    setDeleteConfirmOpen(false);

    if (failed.length === 0) {
      toast.show(`已永久删除 ${succeeded.length} 张图片素材`, "info");
      return;
    }
    const firstError = errorMessage(failed[0].error);
    if (firstError.includes("NOT_CONFIGURED")) onNeedSettings();
    toast.show(
      succeeded.length > 0
        ? `已删除 ${succeeded.length} 张，${failed.length} 张失败：${firstError}`
        : `删除失败：${firstError}`,
      "error",
    );
  };

  const confirmDeleteVideos = async () => {
    if (deleting || selectedVideos.length === 0) return;
    const itemsToDelete = [...selectedVideos];
    setDeleting(true);
    setDeleteCompleted(0);
    const results = await runMaterialOperations(
      itemsToDelete,
      DELETE_CONCURRENCY,
      (item) => deleteImageMaterial(item.mediaId),
      (completed) => setDeleteCompleted(completed),
    );
    const succeeded = results.filter((result) => result.error === undefined).map((result) => result.item);
    const failed = results.filter((result) => result.error !== undefined);
    const succeededIds = new Set(succeeded.map((item) => item.mediaId));
    setVideoItems((current) => current.filter((item) => !succeededIds.has(item.mediaId)));
    setVideoTotal((current) => Math.max(0, current - succeeded.length));
    setVideoSelectedIds(new Set(failed.map((result) => result.item.mediaId)));
    setDeleting(false);
    setDeleteConfirmOpen(false);

    if (failed.length === 0) {
      toast.show(`已永久删除 ${succeeded.length} 个视频素材`, "info");
      return;
    }
    const firstError = errorMessage(failed[0].error);
    if (firstError.includes("NOT_CONFIGURED")) onNeedSettings();
    toast.show(
      succeeded.length > 0
        ? `已删除 ${succeeded.length} 个，${failed.length} 个失败：${firstError}`
        : `删除失败：${firstError}`,
      "error",
    );
  };

  const uploadMaterials = async () => {
    if (uploading) return;
    try {
      const paths = await pickImageFiles();
      if (!paths?.length) return;
      setUploading(true);
      setUploadProgress({completed: 0, total: paths.length});
      const results = await runMaterialOperations(
        paths,
        UPLOAD_CONCURRENCY,
        async (path) => {
          await uploadLocalImage(path, "素材库图片");
        },
        (completed, total) => setUploadProgress({completed, total}),
      );
      const succeeded = results.filter((result) => result.error === undefined).length;
      const failed = results.filter((result) => result.error !== undefined);
      if (succeeded > 0) {
        const refreshSession = ++librarySessionRef.current;
        materialLoadingRef.current = false;
        await loadMaterialLibrary(0, refreshSession);
      }
      if (failed.length === 0) {
        toast.show(`已上传 ${succeeded} 张图片到素材库`, "info");
      } else {
        const firstError = errorMessage(failed[0].error);
        if (firstError.includes("NOT_CONFIGURED") || (failed[0].error as {code?: string})?.code === "NOT_CONFIGURED") {
          onNeedSettings();
        }
        toast.show(
          succeeded > 0
            ? `已上传 ${succeeded} 张，${failed.length} 张失败：${firstError}`
            : `素材上传失败：${firstError}`,
          "error",
        );
      }
    } catch (error) {
      toast.show(`选择图片失败：${errorMessage(error)}`, "error");
    } finally {
      setUploading(false);
      setUploadProgress({completed: 0, total: 0});
    }
  };

  const allLoadedSelected = materialItems.length > 0 && selectedIds.size === materialItems.length;
  const allVideosSelected = videoItems.length > 0 && videoSelectedIds.size === videoItems.length;
  const busy = deleting || uploading;
  const deleteCount = tab === "image" ? selectedItems.length : selectedVideos.length;

  const tabButtonClass = (active: boolean) =>
    `inline-flex h-7 flex-none cursor-pointer items-center gap-1.5 rounded-md border-0 px-3 text-xs font-medium outline-none transition-colors duration-fast focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] ${
      active
        ? "bg-bg text-text shadow-sm"
        : "bg-transparent text-text-secondary hover:bg-bg-tertiary hover:text-text"
    }`;

  return (
    <>
      <Dialog
        open={open}
        title={
          <span className="flex items-center gap-1.5">
            <Images size={16} />
            素材库
          </span>
        }
        onClose={onClose}
        closeDisabled={deleting}
        width="min(90vw,920px)"
        contentPadding={false}
        footer={
          tab === "image" ? (
            <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
              <div className="justify-self-start">
                <Button
                  type="button"
                  variant="secondary"
                  state={uploading ? "loading" : "idle"}
                  loadingText={`正在上传 ${uploadProgress.completed}/${uploadProgress.total}`}
                  disabled={deleting}
                  onClick={() => void uploadMaterials()}
                >
                  <ImageUp size={14} />
                  上传图片
                </Button>
              </div>
              <span className="whitespace-nowrap text-xs font-normal text-text-muted">
                已加载 {materialItems.length}/{materialTotal || materialItems.length} 张
              </span>
              <div className="justify-self-end">
                {materialItems.length < materialTotal && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={materialLoading || busy}
                    onClick={() => void loadMaterialLibrary(materialItems.length)}
                  >
                    {materialLoading ? "加载中…" : "加载更多"}
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
              <div className="justify-self-start">
                <span className="text-xs font-normal text-text-muted">
                  视频请在公众号后台「素材库 → 视频」上传
                </span>
              </div>
              <span className="whitespace-nowrap text-xs font-normal text-text-muted">
                已加载 {videoItems.length}/{videoTotal || videoItems.length} 个
              </span>
              <div className="justify-self-end">
                {videoItems.length < videoTotal && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={videoLoading || busy}
                    onClick={() => void loadVideoLibrary(videoItems.length)}
                  >
                    {videoLoading ? "加载中…" : "加载更多"}
                  </Button>
                )}
              </div>
            </div>
          )
        }
      >
        <div className="flex h-[clamp(360px,calc(86vh-100px),640px)] min-h-0 flex-col">
          <div className="flex h-[42px] flex-none items-center gap-1.5 border-b border-border bg-bg-secondary px-4">
            <button type="button" onClick={() => switchTab("image")} aria-pressed={tab === "image"} className={tabButtonClass(tab === "image")}>
              <ImageIcon size={14} />
              图片
            </button>
            <button type="button" onClick={() => switchTab("video")} aria-pressed={tab === "video"} className={tabButtonClass(tab === "video")}>
              <Clapperboard size={14} />
              视频
            </button>
          </div>

          {tab === "image" ? (
            <>
              <div className="flex h-[42px] flex-none items-center justify-between gap-3 border-b border-border bg-bg-secondary px-4">
                <div className="flex min-w-0 items-center gap-3">
                  {materialItems.length > 0 && (
                    <button
                      type="button"
                      onClick={toggleSelectAllLoaded}
                      className="inline-flex h-8 flex-none cursor-pointer items-center gap-1.5 rounded-sm border-0 bg-transparent px-1.5 text-xs text-text-secondary outline-none transition-colors duration-fast hover:bg-bg-tertiary hover:text-text focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
                    >
                      {allLoadedSelected ? <CheckSquare2 size={14} className="text-accent" /> : <Square size={14} />}
                      {allLoadedSelected ? "取消全选" : "全选已加载"}
                    </button>
                  )}
                  <span className="hidden truncate text-xs text-text-muted sm:inline">
                    {selectedItems.length > 0 ? `已选择 ${selectedItems.length} 张` : "未选择图片"}
                  </span>
                </div>
                <div className="flex flex-none items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={selectedItems.length === 0 || busy}
                    title="永久删除所选图片素材"
                    aria-label={`删除所选图片${selectedItems.length > 0 ? `，共 ${selectedItems.length} 张` : ""}`}
                    className="text-danger hover:bg-danger/10"
                    onClick={() => setDeleteConfirmOpen(true)}
                  >
                    <Trash2 size={14} />
                    <span className="hidden sm:inline">删除所选</span>
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    disabled={!canInsert || selectedItems.length === 0 || busy}
                    title={!canInsert ? "请先打开一篇文章" : "将所选图片插入当前文章"}
                    onClick={insertSelected}
                  >
                    <ImageIcon size={14} />
                    <span className="hidden sm:inline">插入所选</span>
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={!canInsert || selectedItems.length < 2 || busy}
                    title={
                      !canInsert
                        ? "请先打开一篇文章"
                        : selectedItems.length < 2
                          ? "请先选择至少 2 张图片"
                          : "将所选图片以左右滑动组插入当前文章"
                    }
                    onClick={insertFlow}
                  >
                    <MoveHorizontal size={14} />
                    <span className="hidden sm:inline">插入横滑</span>
                  </Button>
                  <button
                    type="button"
                    title={materialLoading ? "正在刷新素材库" : "刷新素材库"}
                    aria-label={materialLoading ? "正在刷新素材库" : "刷新素材库"}
                    disabled={materialLoading || busy}
                    onClick={() => void loadMaterialLibrary(0)}
                    className="inline-grid h-8 w-8 flex-none place-items-center rounded-sm border-0 bg-transparent p-0 text-text-secondary outline-none transition-colors duration-fast hover:bg-bg-tertiary hover:text-text focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:cursor-default disabled:opacity-50"
                  >
                    <RefreshCw size={15} className={materialLoading ? "animate-spin" : ""} />
                  </button>
                </div>
              </div>

              {materialLoading && materialItems.length === 0 ? (
                <div className="grid min-h-0 flex-1 auto-rows-max grid-cols-2 gap-3 overflow-hidden p-4 sm:grid-cols-3 lg:grid-cols-4">
                  {Array.from({length: 8}).map((_, index) => (
                    <div key={index} className="box-border overflow-hidden rounded-lg border border-[color:var(--card-border)] bg-bg-secondary">
                      <div className="aspect-[4/3] animate-pulse bg-bg-tertiary" />
                      <div className="border-t border-border bg-bg-secondary px-2 py-2">
                        <div className="h-2.5 w-3/4 animate-pulse rounded bg-bg-tertiary" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : materialError && materialItems.length === 0 ? (
                <div className="m-4 rounded-md bg-bg-secondary px-3 py-3 text-xs leading-5 text-text-secondary">
                  <div className="font-medium text-text">素材库读取失败</div>
                  <div className="mt-1 break-words">
                    {materialError.includes("NOT_CONFIGURED") ? "请先在设置中填写微信素材上传凭证。" : materialError}
                  </div>
                  <Button type="button" variant="secondary" className="mt-3" disabled={materialLoading} onClick={() => void loadMaterialLibrary(0)}>
                    重试
                  </Button>
                </div>
              ) : materialItems.length > 0 ? (
                <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 [scrollbar-gutter:stable] [scrollbar-width:thin]">
                  <div className="grid auto-rows-max grid-cols-2 content-start gap-3 sm:grid-cols-3 lg:grid-cols-4">
                      {materialItems.map((item, index) => {
                        const selected = selectedIds.has(item.mediaId);
                        return (
                          <button
                            key={item.mediaId}
                            type="button"
                            onClick={() => toggleSelection(item.mediaId)}
                            aria-pressed={selected}
                            aria-label={`${selected ? "取消选择" : "选择"}素材库第 ${index + 1} 张图片：${item.name}`}
                            title={item.name}
                            className={`relative box-border block w-full cursor-pointer appearance-none overflow-hidden rounded-lg border border-[color:var(--card-border)] bg-bg-secondary p-0 text-left outline-none transition-[border-color,background-color,transform] duration-slow ease-bounce focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] ${
                              selected
                                ? "border-accent/70"
                                : "hover:-translate-y-1 hover:bg-bg"
                            }`}
                          >
                            <span className="relative block aspect-[4/3] overflow-hidden bg-bg-tertiary">
                              <img
                                src={toProxyImageUrl(item.url)}
                                alt=""
                                loading="lazy"
                                decoding="async"
                                className="block h-full w-full object-contain"
                              />
                              {selected && (
                                <span aria-hidden="true" className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full border-2 border-white bg-accent text-white">
                                  <Check size={14} strokeWidth={3} />
                                </span>
                              )}
                            </span>
                            <span className="flex h-[34px] items-center justify-between gap-2 border-t border-border bg-bg-secondary px-2">
                              <span className="min-w-0 truncate text-[12px] font-medium leading-4 text-text-secondary">{item.name}</span>
                              <span className="flex-none text-[10px] leading-4 text-text-muted">{formatMaterialTime(item.updateTime)}</span>
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              ) : (
                <div className="m-4 flex min-h-0 flex-1 flex-col items-center justify-center rounded-md bg-bg-secondary px-6 text-center text-sm text-text-secondary">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent-subtle text-accent"><ImageIcon size={22} /></span>
                  <div className="mt-3 font-medium text-text">素材库暂无图片</div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex h-[42px] flex-none items-center justify-between gap-3 border-b border-border bg-bg-secondary px-4">
                <div className="flex min-w-0 items-center gap-3">
                  {videoItems.length > 0 && (
                    <button
                      type="button"
                      onClick={toggleSelectAllVideos}
                      className="inline-flex h-8 flex-none cursor-pointer items-center gap-1.5 rounded-sm border-0 bg-transparent px-1.5 text-xs text-text-secondary outline-none transition-colors duration-fast hover:bg-bg-tertiary hover:text-text focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
                    >
                      {allVideosSelected ? <CheckSquare2 size={14} className="text-accent" /> : <Square size={14} />}
                      {allVideosSelected ? "取消全选" : "全选已加载"}
                    </button>
                  )}
                  <span className="hidden truncate text-xs text-text-muted sm:inline">
                    {selectedVideos.length > 0 ? `已选择 ${selectedVideos.length} 个视频` : "未选择视频"}
                  </span>
                </div>
                <div className="flex flex-none items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={selectedVideos.length === 0 || busy}
                    title="永久删除所选视频素材"
                    aria-label={`删除所选视频${selectedVideos.length > 0 ? `，共 ${selectedVideos.length} 个` : ""}`}
                    className="text-danger hover:bg-danger/10"
                    onClick={() => setDeleteConfirmOpen(true)}
                  >
                    <Trash2 size={14} />
                    <span className="hidden sm:inline">删除所选</span>
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    disabled={!canInsert || selectedVideos.length === 0 || busy}
                    title={!canInsert ? "请先打开一篇文章" : "将所选视频插入当前文章"}
                    onClick={insertSelectedVideos}
                  >
                    <Clapperboard size={14} />
                    <span className="hidden sm:inline">插入所选</span>
                  </Button>
                  <button
                    type="button"
                    title={videoLoading ? "正在刷新素材库" : "刷新素材库"}
                    aria-label={videoLoading ? "正在刷新素材库" : "刷新素材库"}
                    disabled={videoLoading || busy}
                    onClick={() => void loadVideoLibrary(0)}
                    className="inline-grid h-8 w-8 flex-none place-items-center rounded-sm border-0 bg-transparent p-0 text-text-secondary outline-none transition-colors duration-fast hover:bg-bg-tertiary hover:text-text focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:cursor-default disabled:opacity-50"
                  >
                    <RefreshCw size={15} className={videoLoading ? "animate-spin" : ""} />
                  </button>
                </div>
              </div>

              {videoLoading && videoItems.length === 0 ? (
                <div className="grid min-h-0 flex-1 auto-rows-max grid-cols-2 gap-3 overflow-hidden p-4 sm:grid-cols-3 lg:grid-cols-4">
                  {Array.from({length: 8}).map((_, index) => (
                    <div key={index} className="box-border overflow-hidden rounded-lg border border-[color:var(--card-border)] bg-bg-secondary">
                      <div className="aspect-video animate-pulse bg-bg-tertiary" />
                      <div className="border-t border-border bg-bg-secondary px-2 py-2">
                        <div className="h-2.5 w-3/4 animate-pulse rounded bg-bg-tertiary" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : videoError && videoItems.length === 0 ? (
                <div className="m-4 rounded-md bg-bg-secondary px-3 py-3 text-xs leading-5 text-text-secondary">
                  <div className="font-medium text-text">素材库读取失败</div>
                  <div className="mt-1 break-words">
                    {videoError.includes("NOT_CONFIGURED") ? "请先在设置中填写微信素材凭证。" : videoError}
                  </div>
                  <Button type="button" variant="secondary" className="mt-3" disabled={videoLoading} onClick={() => void loadVideoLibrary(0)}>
                    重试
                  </Button>
                </div>
              ) : videoItems.length > 0 ? (
                <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 [scrollbar-gutter:stable] [scrollbar-width:thin]">
                  <div className="grid auto-rows-max grid-cols-2 content-start gap-3 sm:grid-cols-3 lg:grid-cols-4">
                      {videoItems.map((item, index) => {
                        const selected = videoSelectedIds.has(item.mediaId);
                        return (
                          <button
                            key={item.mediaId}
                            type="button"
                            onClick={() => toggleVideoSelection(item.mediaId)}
                            aria-pressed={selected}
                            aria-label={`${selected ? "取消选择" : "选择"}素材库第 ${index + 1} 个视频：${item.name}`}
                            title={item.name}
                            className={`relative box-border block w-full cursor-pointer appearance-none overflow-hidden rounded-lg border border-[color:var(--card-border)] bg-bg-secondary p-0 text-left outline-none transition-[border-color,background-color,transform] duration-slow ease-bounce focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] ${
                              selected
                                ? "border-accent/70"
                                : "hover:-translate-y-1 hover:bg-bg"
                            }`}
                          >
                            <span className="relative block aspect-video overflow-hidden bg-bg-tertiary">
                              {item.coverUrl ? (
                                <img
                                  src={toProxyImageUrl(item.coverUrl)}
                                  alt=""
                                  loading="lazy"
                                  decoding="async"
                                  className="block h-full w-full object-contain"
                                />
                              ) : (
                                <span className="grid h-full w-full place-items-center bg-bg-tertiary text-text-muted">
                                  <Film size={26} />
                                </span>
                              )}
                              {selected && (
                                <span aria-hidden="true" className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full border-2 border-white bg-accent text-white">
                                  <Check size={14} strokeWidth={3} />
                                </span>
                              )}
                            </span>
                            <span className="flex h-[34px] items-center justify-between gap-2 border-t border-border bg-bg-secondary px-2">
                              <span className="min-w-0 truncate text-[12px] font-medium leading-4 text-text-secondary">{item.name}</span>
                              <span className="flex-none text-[10px] leading-4 text-text-muted">{formatMaterialTime(item.updateTime)}</span>
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              ) : (
                <div className="m-4 flex min-h-0 flex-1 flex-col items-center justify-center rounded-md bg-bg-secondary px-6 text-center text-sm text-text-secondary">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent-subtle text-accent"><Film size={22} /></span>
                  <div className="mt-3 font-medium text-text">素材库暂无视频</div>
                  <div className="mt-1 max-w-xs text-xs leading-5">视频请在公众号后台「素材库 → 视频」上传后，再回到这里选择插入。</div>
                </div>
              )}
            </>
          )}
        </div>
      </Dialog>
      <DeleteMaterialConfirmDialog
        open={open && deleteConfirmOpen}
        count={deleteCount}
        kind={tab}
        deleting={deleting}
        completed={deleteCompleted}
        onCancel={() => {
          if (!deleting) setDeleteConfirmOpen(false);
        }}
        onConfirm={() => {
          if (tab === "image") void confirmDelete();
          else void confirmDeleteVideos();
        }}
      />
    </>
  );
}
