import {useCallback, useEffect, useRef, useState} from "react";
import {ImageIcon, Library, RefreshCw} from "lucide-react";
import {toProxyImageUrl} from "../../utils/imageProxy.ts";
import {listImageMaterials, type MaterialImage} from "../../utils/publish.ts";
import {toast} from "../Toast/toast.ts";
import Button from "../ui/Button.tsx";
import Dialog from "../ui/Dialog.tsx";

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (url: string) => void;
  onNeedSettings: () => void;
}

const MATERIAL_PAGE_SIZE = 20;

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

export default function ImageMaterialPickerDialog({open, onClose, onPick, onNeedSettings}: Props) {
  const [materialItems, setMaterialItems] = useState<MaterialImage[]>([]);
  const [materialTotal, setMaterialTotal] = useState(0);
  const [materialLoaded, setMaterialLoaded] = useState(false);
  const [materialLoading, setMaterialLoading] = useState(false);
  const [materialError, setMaterialError] = useState<string | null>(null);
  const materialLoadingRef = useRef(false);

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
    if (!open) return;
    setMaterialItems([]);
    setMaterialTotal(0);
    setMaterialLoaded(false);
    setMaterialLoading(false);
    setMaterialError(null);
    materialLoadingRef.current = false;
    void loadMaterialLibrary(0);
  }, [open, loadMaterialLibrary]);

  const pickMaterialImage = (item: MaterialImage) => {
    onPick(item.url);
    toast.show("已从素材库插入图片", "info");
    onClose();
  };

  return (
    <Dialog
      open={open}
      title={
        <span className="flex items-center gap-1.5">
          <Library size={16} />
          从素材库选择图片
        </span>
      }
      onClose={onClose}
      width="min(86vw,860px)"
      footer={
        <Button type="button" variant="secondary" onClick={onClose}>
          取消
        </Button>
      }
    >
      <div className="flex min-h-[430px] flex-col">
        <div className="mb-3 flex flex-none flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs leading-5 text-text-secondary">
            选择永久素材库里的图片，直接插入到当前光标处，无需再次上传。
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
              disabled={materialLoading}
              onClick={() => void loadMaterialLibrary(0)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-border bg-bg-secondary text-text-secondary outline-none transition-colors duration-fast hover:bg-bg-tertiary hover:text-text focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:cursor-default disabled:opacity-50"
            >
              <RefreshCw size={14} className={materialLoading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {materialLoading && materialItems.length === 0 ? (
          <div className="grid auto-rows-max grid-cols-2 gap-3 overflow-hidden py-[5px] pl-[4px] pr-2 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({length: 8}).map((_, index) => (
              <div
                key={index}
                className="aspect-[2.35/1] animate-pulse overflow-hidden rounded-md border border-border bg-bg-secondary p-2 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_2px_8px_rgba(0,0,0,0.04)]"
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
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable_both-edges] [scrollbar-width:thin] py-[5px] pl-[4px] pr-2">
              <div className="grid auto-rows-max grid-cols-2 gap-3 content-start sm:grid-cols-3 lg:grid-cols-4">
                {materialItems.map((item, index) => (
                  <button
                    key={item.mediaId}
                    type="button"
                    onClick={() => pickMaterialImage(item)}
                    className="group relative block aspect-[2.35/1] w-full appearance-none overflow-hidden rounded-md border border-border bg-bg-secondary p-0 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_2px_8px_rgba(0,0,0,0.04)] outline-none transition-all duration-fast hover:-translate-y-px hover:border-accent/60 hover:shadow-[0_2px_8px_rgba(0,0,0,0.05),0_8px_20px_rgba(0,0,0,0.05)] focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
                    aria-label={`插入素材库第 ${index + 1} 张图片：${item.name}`}
                  >
                    <img
                      src={toProxyImageUrl(item.url)}
                      alt={`素材库图片：${item.name}`}
                      className="block h-full w-full object-cover transition-transform duration-fast group-hover:scale-105"
                    />
                    <span className="absolute inset-x-0 bottom-0 bg-black/55 px-2 py-1 text-left text-[11px] leading-4 text-white/90 opacity-0 transition-opacity group-hover:opacity-100">
                      <span className="block truncate">{item.name}</span>
                      <span className="block text-white/70">{formatMaterialTime(item.updateTime)}</span>
                    </span>
                  </button>
                ))}
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
                  disabled={materialLoading}
                  onClick={() => void loadMaterialLibrary(materialItems.length)}
                >
                  {materialLoading ? "加载中…" : "加载更多"}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex min-h-[260px] flex-col items-center justify-center rounded-md bg-bg-secondary px-6 text-center text-sm text-text-secondary">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent-subtle text-accent">
              <ImageIcon size={22} />
            </span>
            <div className="mt-3 font-medium text-text">素材库暂无图片</div>
            <div className="mt-1 text-xs leading-5">从正文上传过的图片、或手机端上传到永久素材库的图片，会显示在这里。</div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
