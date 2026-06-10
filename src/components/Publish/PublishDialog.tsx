import {useEffect, useMemo, useRef, useState} from "react";
import {useStore} from "../../store/index.ts";
import {solveDraftHtml} from "../../markdown/converter.ts";
import {waitForMathJaxIdle} from "../../markdown/mathjax.ts";
import {toProxyImageUrl} from "../../utils/imageProxy.ts";
import {addDraft, findUnuploadedImages, getCoverCandidates, uploadRemoteThumb, uploadThumb} from "../../utils/publish.ts";
import {toast} from "../Toast/toast.ts";
import {ImageIcon, Images, UploadCloud} from "lucide-react";
import Dialog from "../ui/Dialog.tsx";
import Button from "../ui/Button.tsx";

interface Props {
  open: boolean;
  onClose: () => void;
  onNeedSettings: () => void;
}

const inputClass =
  "box-border h-10 w-full rounded-md border border-border bg-bg px-3 text-sm text-text outline-none transition-colors duration-fast placeholder:text-text-muted hover:border-border-strong focus-visible:border-accent focus-visible:bg-bg-secondary";

function revokePreview(url: string | null) {
  if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
}

export default function PublishDialog({open, onClose, onNeedSettings}: Props) {
  const content = useStore((s) => s.content);
  const currentDocPath = useStore((s) => s.currentDocPath);
  const defaultTitle = currentDocPath
    ? currentDocPath.split("/").pop()!.replace(/\.md$/, "")
    : "未命名";
  const [title, setTitle] = useState(defaultTitle);
  const [thumbId, setThumbId] = useState<string | null>(null);
  const [thumbPreview, setThumbPreview] = useState<string | null>(null);
  const [selectedCandidateUrl, setSelectedCandidateUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<string | null>(null);
  const coverCandidates = useMemo(() => getCoverCandidates(content), [content]);
  previewRef.current = thumbPreview;

  useEffect(() => {
    if (!open) return;
    setTitle(defaultTitle);
    setThumbId(null);
    setSelectedCandidateUrl(null);
    setThumbPreview((prev) => {
      revokePreview(prev);
      return null;
    });
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  }, [open, defaultTitle]);

  // 弹窗卸载时释放最后的预览 blob URL。
  useEffect(() => {
    return () => {
      revokePreview(previewRef.current);
    };
  }, []);

  const pickThumb = async (file: File) => {
    setBusy(true);
    try {
      const id = await uploadThumb(file);
      setThumbId(id);
      setSelectedCandidateUrl(null);
      setThumbPreview((prev) => {
        revokePreview(prev);
        return URL.createObjectURL(file);
      });
    } catch (e) {
      handleThumbError(e);
    } finally {
      setBusy(false);
    }
  };

  const pickArticleThumb = async (url: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const id = await uploadRemoteThumb(url);
      setThumbId(id);
      setSelectedCandidateUrl(url);
      setThumbPreview((prev) => {
        revokePreview(prev);
        return toProxyImageUrl(url);
      });
      toast.show("已选择文中图片作为封面", "info");
    } catch (e) {
      handleThumbError(e);
    } finally {
      setBusy(false);
    }
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

  const publish = async () => {
    const bad = findUnuploadedImages(content);
    if (bad.length > 0) {
      toast.show(`正文有 ${bad.length} 张未上传的图片，请先上传图片再发布`, "error");
      return;
    }
    if (!title.trim()) {
      toast.show("请填写标题", "error");
      return;
    }
    if (!thumbId) {
      toast.show("请选择封面图", "error");
      return;
    }
    setBusy(true);
    try {
      await waitForMathJaxIdle();
      const html = solveDraftHtml();
      await addDraft(title.trim(), html, thumbId);
      toast.show("已发到公众号草稿箱，请在后台确认排版后发送", "info", 4000);
      onClose();
    } catch (e) {
      toast.show(`发布失败：${String(e)}`, "error");
    } finally {
      setBusy(false);
    }
  };

  const openThumbPicker = () => {
    if (busy) return;
    if (fileRef.current) {
      fileRef.current.value = "";
      fileRef.current.click();
    }
  };

  return (
    <Dialog
      open={open}
      title="发布到公众号草稿箱"
      onClose={onClose}
      closeOnOverlay={false}
      width="88vw"
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button type="button" variant="primary" onClick={() => void publish()} disabled={busy}>
            {busy ? "处理中…" : "发布到草稿箱"}
          </Button>
        </>
      }
    >
      <div className="grid items-stretch gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)]">
        <div className="min-w-0 space-y-4 rounded-lg border border-border bg-bg px-3 py-3">
          <div>
            <label htmlFor="publish-title" className="mb-2 block text-[13px] font-medium text-text">
              文章标题
            </label>
            <input
              id="publish-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
              placeholder="输入公众号文章标题"
            />
          </div>

          <div>
            <div className="mb-2 flex items-end justify-between gap-3">
              <div>
                <label htmlFor="publish-thumb" className="block text-[13px] font-medium text-text">
                  封面图
                </label>
                <div className="mt-1 text-xs text-text-muted">建议使用清晰横图，支持 JPG、PNG、GIF。</div>
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
            <button
              type="button"
              onClick={openThumbPicker}
              disabled={busy}
              aria-label={thumbPreview ? "更换封面图" : "上传封面图"}
              className="group relative flex aspect-[16/10] w-full cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-dashed border-border-strong bg-bg-secondary text-left outline-none transition-all duration-fast ease-smooth hover:border-accent hover:bg-accent-subtle focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:cursor-default disabled:opacity-60"
            >
              {thumbPreview ? (
                <>
                  <img src={thumbPreview} alt="已选择的封面图预览" className="absolute inset-0 h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent opacity-90 transition-opacity group-hover:opacity-100" />
                  <div className="relative mt-auto flex w-full items-center justify-between gap-3 p-4 text-white">
                    <div>
                      <div className="text-sm font-semibold">封面已上传</div>
                      <div className="mt-1 text-xs text-white/80">点击此区域可重新选择本地图片</div>
                    </div>
                    <span className="inline-flex h-9 items-center gap-1.5 rounded-md bg-white/95 px-3 text-[13px] font-medium text-text shadow-sm transition-colors group-hover:bg-white">
                      <UploadCloud size={15} />
                      更换
                    </span>
                  </div>
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

        <div className="min-w-0 rounded-lg border border-border bg-bg px-3 py-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 text-[13px] font-medium text-text">
              <Images size={15} className="text-accent" />
              从文中选择
            </div>
            <span className="text-xs text-text-muted">{coverCandidates.length} 张可选</span>
          </div>
          {coverCandidates.length > 0 ? (
            <div className="grid max-h-[52vh] grid-cols-3 gap-2 overflow-y-auto pr-1 xl:grid-cols-4 2xl:grid-cols-5">
              {coverCandidates.map((candidate, index) => {
                const selected = selectedCandidateUrl === candidate.url;
                return (
                  <button
                    key={candidate.url}
                    type="button"
                    disabled={busy}
                    onClick={() => void pickArticleThumb(candidate.url)}
                    className={`group relative aspect-[16/10] overflow-hidden rounded-md border bg-bg-secondary outline-none transition-all duration-fast hover:border-accent focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:cursor-default disabled:opacity-60 ${
                      selected ? "border-accent ring-2 ring-[color:var(--ring)]" : "border-border"
                    }`}
                    aria-label={`选择第 ${index + 1} 张文中图片作为封面`}
                  >
                    <img
                      src={toProxyImageUrl(candidate.url)}
                      alt="文中候选封面"
                      className="h-full w-full object-cover transition-transform duration-fast group-hover:scale-105"
                    />
                    {selected && (
                      <span className="absolute right-1.5 top-1.5 rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-white shadow-sm">
                        已选
                      </span>
                    )}
                    <span className="absolute inset-x-0 bottom-0 bg-black/50 px-2 py-1 text-left text-[11px] text-white/90 opacity-0 transition-opacity group-hover:opacity-100">
                      设为封面
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded-md bg-bg-secondary px-3 py-3 text-xs leading-5 text-text-secondary">
              正文中未找到已上传到微信的图片，请先上传正文图片，或直接上传本地封面。
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
