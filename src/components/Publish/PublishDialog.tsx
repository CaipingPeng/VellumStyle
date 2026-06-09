import {useEffect, useRef, useState} from "react";
import {useStore} from "../../store/index.ts";
import {solveDraftHtml} from "../../markdown/converter.ts";
import {findUnuploadedImages, uploadThumb, addDraft} from "../../utils/publish.ts";
import {toast} from "../Toast/toast.ts";

interface Props {
  onClose: () => void;
  onNeedSettings: () => void;
}

export default function PublishDialog({onClose, onNeedSettings}: Props) {
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
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        <h3 style={{margin: "0 0 16px", fontSize: 16}}>发布到公众号草稿箱</h3>

        <label style={labelStyle}>标题</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />

        <label style={labelStyle}>封面图（必填）</label>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/gif"
          style={{display: "none"}}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void pickThumb(f);
          }}
        />
        <div style={{display: "flex", alignItems: "center", gap: 12, marginBottom: 16}}>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} style={secondaryBtn}>
            选择封面
          </button>
          {thumbPreview && <img src={thumbPreview} alt="封面" style={{height: 48, borderRadius: 4}} />}
        </div>

        <div style={{display: "flex", justifyContent: "flex-end", gap: 8}}>
          <button type="button" onClick={onClose} style={secondaryBtn}>取消</button>
          <button type="button" onClick={() => void publish()} disabled={busy} style={primaryBtn}>
            {busy ? "处理中…" : "发布到草稿箱"}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 900,
};
const panel: React.CSSProperties = {
  width: 420, background: "#fff", borderRadius: 8, padding: 24,
  boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
};
const labelStyle: React.CSSProperties = {display: "block", fontSize: 13, color: "#666", marginBottom: 4};
const inputStyle: React.CSSProperties = {
  width: "100%", height: 32, padding: "0 8px", marginBottom: 16,
  border: "1px solid #d9d9d9", borderRadius: 4, boxSizing: "border-box", fontSize: 14,
};
const secondaryBtn: React.CSSProperties = {
  height: 32, padding: "0 16px", border: "1px solid #d9d9d9",
  borderRadius: 4, background: "#fff", cursor: "pointer", fontSize: 14,
};
const primaryBtn: React.CSSProperties = {
  height: 32, padding: "0 16px", border: "none",
  borderRadius: 4, background: "#07c160", color: "#fff", cursor: "pointer", fontSize: 14,
};
