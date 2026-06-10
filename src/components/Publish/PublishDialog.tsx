import {useEffect, useRef, useState} from "react";
import {useStore} from "../../store/index.ts";
import {solveDraftHtml} from "../../markdown/converter.ts";
import {waitForMathJaxIdle} from "../../markdown/mathjax.ts";
import {findUnuploadedImages, uploadThumb, addDraft} from "../../utils/publish.ts";
import {toast} from "../Toast/toast.ts";
import Dialog from "../ui/Dialog.tsx";
import Button from "../ui/Button.tsx";

interface Props {
  open: boolean;
  onClose: () => void;
  onNeedSettings: () => void;
}

const inputClass =
  "h-8 w-full rounded-sm border border-border px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]";

export default function PublishDialog({open, onClose, onNeedSettings}: Props) {
  const content = useStore((s) => s.content);
  const currentDocPath = useStore((s) => s.currentDocPath);
  const defaultTitle = currentDocPath
    ? currentDocPath.split("/").pop()!.replace(/\.md$/, "")
    : "未命名";
  const [title, setTitle] = useState(defaultTitle);
  const [thumbId, setThumbId] = useState<string | null>(null);
  const [thumbPreview, setThumbPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<string | null>(null);
  previewRef.current = thumbPreview;

  useEffect(() => {
    if (!open) return;
    setTitle(defaultTitle);
    setThumbId(null);
    setThumbPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  }, [open, defaultTitle]);

  // 弹窗卸载时释放最后的预览 blob URL。
  useEffect(() => {
    return () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  const pickThumb = async (file: File) => {
    setBusy(true);
    try {
      const id = await uploadThumb(file);
      setThumbId(id);
      setThumbPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });
    } catch (e) {
      const msg = String(e);
      if (msg.includes("NOT_CONFIGURED")) {
        toast.show("尚未配置微信图床，请先在设置中填写", "error");
        onNeedSettings();
      } else {
        toast.show(`封面上传失败：${msg}`, "error");
      }
    } finally {
      setBusy(false);
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

  return (
    <Dialog
      open={open}
      title="发布到公众号草稿箱"
      onClose={onClose}
      closeOnOverlay={false}
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
      <label className="mb-1 block text-[13px] text-text-secondary">标题</label>
      <input value={title} onChange={(e) => setTitle(e.target.value)} className={`${inputClass} mb-4`} />

      <label className="mb-1 block text-[13px] text-text-secondary">封面图（必填）</label>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void pickThumb(f);
        }}
      />
      <div className="flex items-center gap-3">
        <Button type="button" variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
          选择封面
        </Button>
        {thumbPreview && <img src={thumbPreview} alt="封面" className="h-12 rounded" />}
      </div>
    </Dialog>
  );
}
