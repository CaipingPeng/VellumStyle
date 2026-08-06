import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {
  Check,
  CheckSquare2,
  Clapperboard,
  AudioLines,
  CloudDownload,
  ClipboardPaste,
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
  bindVoiceMaterials,
  deleteImageMaterial,
  fetchBackendVoiceList,
  formatVoiceMarkup,
  listImageMaterials,
  listVideoMaterials,
  listVoiceMaterials,
  loadVoiceBinding,
  openWechatBackend,
  parseVoiceBackendResponse,
  parseVoiceCode,
  saveVoiceBinding,
  type MaterialImage,
  type MaterialVideo,
  type MaterialVoice,
} from "../../utils/publish.ts";
import {pickImageFiles, uploadLocalImage} from "../../utils/upload.ts";
import {toast} from "../Toast/toast.ts";
import Button from "../ui/Button.tsx";
import Dialog from "../ui/Dialog.tsx";
import DeleteMaterialConfirmDialog from "./DeleteMaterialConfirmDialog.tsx";
import {runMaterialOperations} from "./materialBatch.ts";
import AudioCodeBindDialog from "./AudioCodeBindDialog.tsx";
import VoiceBatchBindDialog from "./VoiceBatchBindDialog.tsx";

interface Props {
  open: boolean;
  canInsert: boolean;
  onClose: () => void;
  onPick: (urls: string[]) => void;
  onPickFlow: (urls: string[]) => void;
  onPickVideos?: (videos: MaterialVideo[]) => void;
  onPickVoices?: (markups: string[]) => void;
  onNeedSettings: () => void;
}

type MaterialTab = "image" | "video" | "voice";

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

export default function ImageMaterialPickerDialog({open, canInsert, onClose, onPick, onPickFlow, onPickVideos, onPickVoices, onNeedSettings}: Props) {
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
  const [voiceItems, setVoiceItems] = useState<MaterialVoice[]>([]);
  const [voiceTotal, setVoiceTotal] = useState(0);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(null);
  const [voiceBindOpen, setVoiceBindOpen] = useState(false);
  const [voiceBindError, setVoiceBindError] = useState<string | null>(null);
  const [voiceBatchOpen, setVoiceBatchOpen] = useState(false);
  const [voiceBatchError, setVoiceBatchError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteCompleted, setDeleteCompleted] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({completed: 0, total: 0});
  const materialLoadingRef = useRef(false);
  const videoLoadingRef = useRef(false);
  const voiceLoadingRef = useRef(false);
  const librarySessionRef = useRef(0);

  const selectedItems = useMemo(
    () => materialItems.filter((item) => selectedIds.has(item.mediaId)),
    [materialItems, selectedIds],
  );

  const selectedVideos = useMemo(
    () => videoItems.filter((item) => videoSelectedIds.has(item.mediaId)),
    [videoItems, videoSelectedIds],
  );

  const selectedVoice = useMemo(
    () => voiceItems.find((item) => item.mediaId === selectedVoiceId) ?? null,
    [voiceItems, selectedVoiceId],
  );

  const boundVoiceIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of voiceItems) {
      if (loadVoiceBinding(item.mediaId)) ids.add(item.mediaId);
    }
    return ids;
  }, [voiceItems]);

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

  const loadVoiceLibrary = useCallback(async (offset = 0, session = librarySessionRef.current) => {
    if (voiceLoadingRef.current) return;
    voiceLoadingRef.current = true;
    setVoiceLoading(true);
    setVoiceError(null);
    try {
      const page = await listVoiceMaterials(offset, MATERIAL_PAGE_SIZE);
      if (session !== librarySessionRef.current) return;
      setVoiceTotal(page.totalCount);
      setVoiceItems((prev) => (offset === 0 ? page.items : mergeMaterialItems(prev, page.items)));
      if (offset === 0) setSelectedVoiceId(null);
    } catch (error) {
      if (session !== librarySessionRef.current) return;
      const message = errorMessage(error);
      setVoiceError(message);
      if (message.includes("NOT_CONFIGURED")) {
        toast.show("尚未配置微信素材凭证，请先在设置中填写", "error");
        onNeedSettings();
      } else {
        toast.show(`素材库读取失败：${message}`, "error");
      }
    } finally {
      if (session === librarySessionRef.current) {
        voiceLoadingRef.current = false;
        setVoiceLoading(false);
      }
    }
  }, [onNeedSettings]);

  useEffect(() => {
    const session = ++librarySessionRef.current;
    materialLoadingRef.current = false;
    videoLoadingRef.current = false;
    voiceLoadingRef.current = false;
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
    setVoiceItems([]);
    setVoiceTotal(0);
    setVoiceLoading(false);
    setVoiceError(null);
    setSelectedVoiceId(null);
    setVoiceBindOpen(false);
    setVoiceBindError(null);
    setVoiceBatchOpen(false);
    setVoiceBatchError(null);
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
    if (next === "voice" && voiceItems.length === 0 && !voiceLoadingRef.current) {
      void loadVoiceLibrary(0);
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

  const toggleVoiceSelection = (mediaId: string) => {
    setSelectedVoiceId((current) => (current === mediaId ? null : mediaId));
  };

  const insertSelectedVoice = () => {
    if (!canInsert || !selectedVoice) return;
    const binding = loadVoiceBinding(selectedVoice.mediaId);
    if (!binding) {
      toast.show(
        `「${selectedVoice.name}」尚未绑定，可先点「后台同步」一次绑定全部，或粘贴音频代码`,
        "info",
        4000,
      );
      setVoiceBindError(null);
      setVoiceBindOpen(true);
      return;
    }
    onPickVoices?.([formatVoiceMarkup(binding)]);
    toast.show(`已插入「${selectedVoice.name}」`, "info");
    onClose();
  };

  const submitVoiceBinding = (source: string) => {
    if (!selectedVoice) return;
    const info = parseVoiceCode(source);
    if (!info) {
      setVoiceBindError(
        "没有识别到音频代码，请确认复制的是源码模式下 <mpvoice> 或 <section class=\"js_editor_audio\"> 的完整标签。",
      );
      return;
    }
    saveVoiceBinding(selectedVoice.mediaId, info);
    setVoiceBindOpen(false);
    setVoiceBindError(null);
    onPickVoices?.([formatVoiceMarkup(info)]);
    toast.show(`已插入「${selectedVoice.name}」，下次可直接插入`, "info");
    onClose();
  };

  const submitVoiceBatch = (source: string) => {
    const candidates = parseVoiceBackendResponse(source);
    if (candidates.length === 0) {
      setVoiceBatchError("没有解析到音频数据，请确认复制的是音频列表接口的完整响应（JSON）。");
      return;
    }
    if (voiceItems.length === 0) {
      setVoiceBatchError("素材库音频列表尚未加载，请先加载音频素材再绑定。");
      return;
    }
    const bound = bindVoiceMaterials(voiceItems, candidates);
    if (bound === 0) {
      setVoiceBatchError(
        `响应里 ${candidates.length} 条音频均未与素材库列表匹配，请确认响应与素材库来自同一公众号。`,
      );
      return;
    }
    setVoiceBatchOpen(false);
    setVoiceBatchError(null);
    toast.show(
      bound === candidates.length
        ? `已批量绑定 ${bound} 个音频，之后可直接插入`
        : `已绑定 ${bound} 个音频，${candidates.length - bound} 个名称未匹配`,
      "info",
    );
  };

  const syncVoicesFromBackend = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      let response: string;
      try {
        response = await fetchBackendVoiceList();
      } catch (error) {
        const message = errorMessage(error);
        if (message.includes("WECHAT_BACKEND_NOT_OPENED")) {
          await openWechatBackend();
          toast.show("请在打开的微信后台窗口扫码登录，登录后再次点击「后台同步」", "info", 5000);
          return;
        }
        throw error;
      }

      const candidates = parseVoiceBackendResponse(response);
      if (candidates.length === 0) {
        let hint = "没有解析到音频数据，请确认已在后台窗口登录微信公众平台";
        try {
          const data = JSON.parse(response) as {
            vs_error?: unknown;
            reason?: string;
            url?: string;
            token?: string;
            status?: number;
            body?: string;
            message?: string;
            base_resp?: {ret?: number; err_msg?: string};
          };
          if (data.vs_error) {
            const parts: string[] = [`后台脚本返回诊断：${data.reason ?? "unknown"}`];
            if (data.message) parts.push(data.message);
            if (data.url) parts.push(`页面：${data.url.slice(0, 120)}`);
            if (data.token !== undefined) parts.push(`token：${data.token ? "有" : "无"}`);
            if (data.status !== undefined) parts.push(`HTTP ${data.status}`);
            if (data.body) parts.push(`返回：${data.body.slice(0, 150)}`);
            hint = parts.join("；");
          } else if (data.base_resp && data.base_resp.ret !== undefined && data.base_resp.ret !== 0) {
            hint = `后台返回错误（${data.base_resp.ret}）：${data.base_resp.err_msg ?? "请确认已登录微信后台"}`;
          }
        } catch {
          // 保留默认提示
        }
        toast.show(hint, "error", 5000);
        return;
      }

      if (voiceItems.length === 0) {
        toast.show("素材库音频列表尚未加载，请先加载音频素材再同步", "error");
        return;
      }
    const bound = bindVoiceMaterials(voiceItems, candidates);
    if (bound > 0) {
      // 绑定写入 localStorage，刷新引用让卡片上的已绑定状态更新
      setVoiceItems((current) => [...current]);
    }
    toast.show(
        bound > 0
          ? bound === candidates.length
            ? `已从后台同步并绑定 ${bound} 个音频`
            : `已绑定 ${bound} 个音频，${candidates.length - bound} 个名称未匹配`
          : "没有匹配到素材库音频，请确认后台与素材库是同一公众号",
        bound > 0 ? "info" : "error",
      );
    } catch (error) {
      toast.show(`后台同步失败：${errorMessage(error)}`, "error");
    } finally {
      setSyncing(false);
    }
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
          ) : tab === "video" ? (
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
          ) : (
            <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
              <div className="justify-self-start">
                <span className="text-xs font-normal text-text-muted">
                  音频请在公众号后台「素材库 → 音频」上传
                </span>
              </div>
              <span className="whitespace-nowrap text-xs font-normal text-text-muted">
                已加载 {voiceItems.length}/{voiceTotal || voiceItems.length} 个
              </span>
              <div className="justify-self-end">
                {voiceItems.length < voiceTotal && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={voiceLoading || busy}
                    onClick={() => void loadVoiceLibrary(voiceItems.length)}
                  >
                    {voiceLoading ? "加载中…" : "加载更多"}
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
            <button type="button" onClick={() => switchTab("voice")} aria-pressed={tab === "voice"} className={tabButtonClass(tab === "voice")}>
              <AudioLines size={14} />
              音频
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
          ) : tab === "video" ? (
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
          ) : (
            <>
              <div className="flex h-[42px] flex-none items-center justify-between gap-3 border-b border-border bg-bg-secondary px-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="hidden truncate text-xs text-text-muted sm:inline">
                    {selectedVoice ? `已选择：${selectedVoice.name}` : "未选择音频"}
                  </span>
                </div>
                <div className="flex flex-none items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    state={syncing ? "loading" : "idle"}
                    loadingText="同步中…"
                    disabled={busy}
                    title="从已登录的微信后台窗口静默拉取音频列表并自动绑定"
                    onClick={() => void syncVoicesFromBackend()}
                  >
                    <CloudDownload size={14} />
                    <span className="hidden sm:inline">后台同步</span>
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy}
                    title="粘贴后台音频素材列表响应，一次绑定全部音频"
                    onClick={() => {
                      setVoiceBatchError(null);
                      setVoiceBatchOpen(true);
                    }}
                  >
                    <ClipboardPaste size={14} />
                    <span className="hidden sm:inline">批量绑定</span>
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    disabled={!canInsert || !selectedVoice || busy}
                    title={!canInsert ? "请先打开一篇文章" : "将所选音频插入当前文章"}
                    onClick={insertSelectedVoice}
                  >
                    <AudioLines size={14} />
                    <span className="hidden sm:inline">插入所选</span>
                  </Button>
                  <button
                    type="button"
                    title={voiceLoading ? "正在刷新素材库" : "刷新素材库"}
                    aria-label={voiceLoading ? "正在刷新素材库" : "刷新素材库"}
                    disabled={voiceLoading || busy}
                    onClick={() => void loadVoiceLibrary(0)}
                    className="inline-grid h-8 w-8 flex-none place-items-center rounded-sm border-0 bg-transparent p-0 text-text-secondary outline-none transition-colors duration-fast hover:bg-bg-tertiary hover:text-text focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:cursor-default disabled:opacity-50"
                  >
                    <RefreshCw size={15} className={voiceLoading ? "animate-spin" : ""} />
                  </button>
                </div>
              </div>

              {voiceLoading && voiceItems.length === 0 ? (
                <div className="grid min-h-0 flex-1 auto-rows-max grid-cols-2 gap-3 overflow-hidden p-4 sm:grid-cols-3 lg:grid-cols-4">
                  {Array.from({length: 8}).map((_, index) => (
                    <div key={index} className="box-border overflow-hidden rounded-lg border border-[color:var(--card-border)] bg-bg-secondary">
                      <div className="h-[76px] animate-pulse bg-bg-tertiary" />
                      <div className="border-t border-border bg-bg-secondary px-2 py-2">
                        <div className="h-2.5 w-3/4 animate-pulse rounded bg-bg-tertiary" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : voiceError && voiceItems.length === 0 ? (
                <div className="m-4 rounded-md bg-bg-secondary px-3 py-3 text-xs leading-5 text-text-secondary">
                  <div className="font-medium text-text">素材库读取失败</div>
                  <div className="mt-1 break-words">
                    {voiceError.includes("NOT_CONFIGURED") ? "请先在设置中填写微信素材凭证。" : voiceError}
                  </div>
                  <Button type="button" variant="secondary" className="mt-3" disabled={voiceLoading} onClick={() => void loadVoiceLibrary(0)}>
                    重试
                  </Button>
                </div>
              ) : voiceItems.length > 0 ? (
                <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 [scrollbar-gutter:stable] [scrollbar-width:thin]">
                  <div className="grid auto-rows-max grid-cols-2 content-start gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {voiceItems.map((item, index) => {
                      const selected = selectedVoiceId === item.mediaId;
                      return (
                        <button
                          key={item.mediaId}
                          type="button"
                          onClick={() => toggleVoiceSelection(item.mediaId)}
                          aria-pressed={selected}
                          aria-label={`${selected ? "取消选择" : "选择"}素材库第 ${index + 1} 个音频：${item.name}`}
                          title={item.name}
                          className={`relative box-border block w-full cursor-pointer appearance-none overflow-hidden rounded-lg border border-[color:var(--card-border)] bg-bg-secondary p-0 text-left outline-none transition-[border-color,background-color,transform] duration-slow ease-bounce focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] ${
                            selected
                              ? "border-accent/70"
                              : "hover:-translate-y-1 hover:bg-bg"
                          }`}
                        >
                          <span className="flex h-[76px] items-center gap-3 px-3">
                            <span className="grid h-11 w-11 flex-none place-items-center rounded-full bg-accent-subtle text-accent">
                              <AudioLines size={20} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex min-w-0 items-center gap-1.5">
                                <span className="min-w-0 truncate text-[13px] font-medium leading-5 text-text-secondary">{item.name}</span>
                                {!boundVoiceIds.has(item.mediaId) && (
                                  <span className="flex-none rounded-sm bg-bg-tertiary px-1 py-px text-[10px] leading-4 text-text-muted">未绑定</span>
                                )}
                              </span>
                              <span className="mt-0.5 block text-[11px] leading-4 text-text-muted">{formatMaterialTime(item.updateTime)}</span>
                            </span>
                            {selected && (
                              <span aria-hidden="true" className="grid h-6 w-6 flex-none place-items-center rounded-full border-2 border-white bg-accent text-white">
                                <Check size={14} strokeWidth={3} />
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="m-4 flex min-h-0 flex-1 flex-col items-center justify-center rounded-md bg-bg-secondary px-6 text-center text-sm text-text-secondary">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent-subtle text-accent"><AudioLines size={22} /></span>
                  <div className="mt-3 font-medium text-text">素材库暂无音频</div>
                  <div className="mt-1 max-w-xs text-xs leading-5">音频请在公众号后台「素材库 → 音频」上传后，再回到这里选择插入。</div>
                </div>
              )}
            </>
          )}
        </div>
      </Dialog>
      <AudioCodeBindDialog
        open={open && voiceBindOpen}
        audioName={selectedVoice?.name ?? "该音频"}
        error={voiceBindError}
        onCancel={() => setVoiceBindOpen(false)}
        onSubmit={(source) => submitVoiceBinding(source)}
      />
      <VoiceBatchBindDialog
        open={open && voiceBatchOpen}
        error={voiceBatchError}
        onCancel={() => setVoiceBatchOpen(false)}
        onSubmit={(source) => submitVoiceBatch(source)}
      />
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
