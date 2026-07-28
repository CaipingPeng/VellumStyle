import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {Check, CheckSquare2, ImageIcon, Images, ImageUp, RefreshCw, Square, Trash2} from "lucide-react";
import {toProxyImageUrl} from "../../utils/imageProxy.ts";
import {deleteImageMaterial, listImageMaterials, type MaterialImage} from "../../utils/publish.ts";
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
  onNeedSettings: () => void;
}

const MATERIAL_PAGE_SIZE = 20;
const DELETE_CONCURRENCY = 4;
const UPLOAD_CONCURRENCY = 16;

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

function errorMessage(error: unknown): string {
  return typeof error === "string" ? error : (error as Error)?.message || "未知错误";
}

export default function ImageMaterialPickerDialog({open, canInsert, onClose, onPick, onNeedSettings}: Props) {
  const [materialItems, setMaterialItems] = useState<MaterialImage[]>([]);
  const [materialTotal, setMaterialTotal] = useState(0);
  const [materialLoading, setMaterialLoading] = useState(false);
  const [materialError, setMaterialError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteCompleted, setDeleteCompleted] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({completed: 0, total: 0});
  const materialLoadingRef = useRef(false);
  const librarySessionRef = useRef(0);

  const selectedItems = useMemo(
    () => materialItems.filter((item) => selectedIds.has(item.mediaId)),
    [materialItems, selectedIds],
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

  useEffect(() => {
    const session = ++librarySessionRef.current;
    materialLoadingRef.current = false;
    if (!open) return;
    setMaterialItems([]);
    setMaterialTotal(0);
    setMaterialLoading(false);
    setMaterialError(null);
    setSelectedIds(new Set());
    setDeleteConfirmOpen(false);
    setDeleting(false);
    setDeleteCompleted(0);
    setUploading(false);
    setUploadProgress({completed: 0, total: 0});
    void loadMaterialLibrary(0, session);
  }, [open, loadMaterialLibrary]);

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

  const insertSelected = () => {
    if (!canInsert || selectedItems.length === 0) return;
    onPick(selectedItems.map((item) => item.url));
    toast.show(`已插入 ${selectedItems.length} 张素材库图片`, "info");
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

  return (
    <>
      <Dialog
        open={open}
        title={
          <span className="flex items-center gap-1.5">
            <Images size={16} />
            图片素材库
          </span>
        }
        onClose={onClose}
        closeDisabled={deleting}
        width="min(90vw,920px)"
        headerActions={
          <>
            <button
              type="button"
              title="刷新素材库"
              aria-label="刷新素材库"
              disabled={materialLoading || deleting}
              onClick={() => void loadMaterialLibrary(0)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-border bg-bg-secondary text-text-secondary outline-none transition-colors duration-fast hover:bg-bg-tertiary hover:text-text focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:cursor-default disabled:opacity-50"
            >
              <RefreshCw size={14} className={materialLoading ? "animate-spin" : ""} />
            </button>
            <Button
              type="button"
              variant="secondary"
              disabled={selectedItems.length === 0 || deleting || uploading}
              title="永久删除所选图片素材"
              aria-label={`删除所选图片${selectedItems.length > 0 ? `，共 ${selectedItems.length} 张` : ""}`}
              className="text-danger hover:bg-danger/10"
              onClick={() => setDeleteConfirmOpen(true)}
            >
              <Trash2 size={14} />
              <span className="hidden sm:inline">删除所选{selectedItems.length > 0 ? ` (${selectedItems.length})` : ""}</span>
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={!canInsert || selectedItems.length === 0 || deleting || uploading}
              title={!canInsert ? "请先打开一篇文章" : "将所选图片插入当前文章"}
              onClick={insertSelected}
            >
              <ImageIcon size={14} />
              <span className="hidden sm:inline">插入所选{selectedItems.length > 0 ? ` (${selectedItems.length})` : ""}</span>
            </Button>
          </>
        }
        footer={
          <div className="flex w-full items-center justify-between gap-3">
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
            <div className="flex items-center gap-2">
              <span className="text-xs font-normal text-text-muted">
                {selectedItems.length > 0 ? `已选择 ${selectedItems.length} 张` : `共 ${materialTotal} 张`}
              </span>
              <Button type="button" variant="secondary" disabled={deleting} onClick={onClose}>关闭</Button>
            </div>
          </div>
        }
      >
        <div className="flex min-h-[430px] flex-col">
          <div className="mb-3 flex flex-none items-center justify-between gap-3">
            <div className="text-xs leading-5 text-text-secondary">
              点击图片可多选，再通过右上角按钮插入或永久删除。
            </div>
            {materialItems.length > 0 && (
              <button
                type="button"
                onClick={toggleSelectAllLoaded}
                className="inline-flex h-7 flex-none items-center gap-1.5 rounded-sm px-2 text-xs text-text-secondary hover:bg-bg-tertiary hover:text-text"
              >
                {allLoadedSelected ? <CheckSquare2 size={14} className="text-accent" /> : <Square size={14} />}
                {allLoadedSelected ? "取消全选" : "全选已加载"}
              </button>
            )}
          </div>

          {materialLoading && materialItems.length === 0 ? (
            <div className="grid auto-rows-max grid-cols-2 gap-3 overflow-hidden py-[5px] pl-[4px] pr-2 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({length: 8}).map((_, index) => (
                <div key={index} className="aspect-[4/3] animate-pulse overflow-hidden rounded-md border border-border bg-bg-secondary p-2">
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
              <Button type="button" variant="secondary" className="mt-3" disabled={materialLoading} onClick={() => void loadMaterialLibrary(0)}>
                重试
              </Button>
            </div>
          ) : materialItems.length > 0 ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable_both-edges] [scrollbar-width:thin] py-[5px] pl-[4px] pr-2">
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
                        className={`group relative block aspect-[4/3] w-full appearance-none overflow-hidden rounded-md bg-bg-secondary p-0 outline-none transition-all duration-fast focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] ${selected ? "border-2 border-accent shadow-[0_0_0_2px_var(--accent-subtle)]" : "border border-border hover:border-accent/60"}`}
                      >
                        <img src={toProxyImageUrl(item.url)} alt={`素材库图片：${item.name}`} className="block h-full w-full object-contain" />
                        <span className="absolute inset-x-0 bottom-0 bg-black/60 px-2 py-1 text-left text-[11px] leading-4 text-white/90">
                          <span className="block truncate">{item.name}</span>
                          <span className="block text-white/70">{formatMaterialTime(item.updateTime)}</span>
                        </span>
                        {selected && (
                          <span className="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-accent text-white shadow-sm" aria-hidden="true">
                            <Check size={15} strokeWidth={3} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="mt-3 flex flex-none items-center justify-between gap-3">
                <span className="text-xs text-text-muted">
                  已加载 {materialItems.length}/{materialTotal || materialItems.length} 张
                </span>
                {materialItems.length < materialTotal && (
                  <Button type="button" variant="secondary" disabled={materialLoading || deleting} onClick={() => void loadMaterialLibrary(materialItems.length)}>
                    {materialLoading ? "加载中…" : "加载更多"}
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex min-h-[260px] flex-col items-center justify-center rounded-md bg-bg-secondary px-6 text-center text-sm text-text-secondary">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent-subtle text-accent"><ImageIcon size={22} /></span>
              <div className="mt-3 font-medium text-text">素材库暂无图片</div>
              <div className="mt-1 text-xs leading-5">可通过窗口底部的上传按钮添加永久图片素材。</div>
            </div>
          )}
        </div>
      </Dialog>
      <DeleteMaterialConfirmDialog
        open={open && deleteConfirmOpen}
        count={selectedItems.length}
        deleting={deleting}
        completed={deleteCompleted}
        onCancel={() => {
          if (!deleting) setDeleteConfirmOpen(false);
        }}
        onConfirm={() => void confirmDelete()}
      />
    </>
  );
}
