import {useEffect, useState} from "react";
import {invoke} from "@tauri-apps/api/core";
import Dialog from "../ui/Dialog.tsx";
import {toast} from "../Toast/toast.ts";
import Button from "../ui/Button.tsx";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface AppConfig {
  wechat: {
    app_id: string;
    app_secret: string;
  };
}

const inputClass =
  "h-[34px] w-full rounded-sm border border-border px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]";

// 设置弹窗：读 get_config 回显，保存调 save_config（写 config.local.yaml；微信凭证变更会清 token 缓存）。
export default function SettingsDialog({open, onClose}: Props) {
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoaded(false);
    invoke<AppConfig>("get_config")
      .then((cfg) => {
        setAppId(cfg.wechat?.app_id || "");
        setAppSecret(cfg.wechat?.app_secret || "");
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [open]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await invoke("save_config", {
        appId: appId.trim(),
        appSecret: appSecret.trim(),
      });
      onClose();
    } catch (e) {
      const msg = typeof e === "string" ? e : (e as Error)?.message || "保存失败";
      toast.show(msg, "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      title="设置"
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button type="button" variant="primary" onClick={handleSave} disabled={saving || !loaded}>
            {saving ? "保存中…" : "保存"}
          </Button>
        </>
      }
    >
      <section className="flex flex-col gap-3">
        <div className="text-sm font-semibold text-text">微信图床设置</div>
        <label className="flex flex-col gap-1 text-[13px] text-text-secondary">
          AppID
          <input
            value={appId}
            onChange={(e) => setAppId(e.target.value)}
            placeholder="公众号 AppID（wx 开头）"
            disabled={!loaded}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-text-secondary">
          AppSecret
          <input
            value={appSecret}
            onChange={(e) => setAppSecret(e.target.value)}
            placeholder="公众号 AppSecret"
            type="password"
            disabled={!loaded}
            className={inputClass}
          />
        </label>
        <p className="m-0 text-xs leading-relaxed text-text-muted">
          在「微信公众平台 → 设置与开发 → 基本配置」获取。凭证仅保存在本机，用于上传图片到你公众号的素材库。
        </p>
      </section>
    </Dialog>
  );
}
