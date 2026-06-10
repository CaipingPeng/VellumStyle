import {useEffect, useState} from "react";
import {invoke} from "@tauri-apps/api/core";
import {Eye, EyeOff, KeyRound, LockKeyhole, Save, ShieldCheck} from "lucide-react";
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
  "h-10 min-w-0 flex-1 border-0 bg-transparent text-sm text-text outline-none placeholder:text-text-muted disabled:cursor-default";

const inputShellClass =
  "group flex h-10 items-center gap-2 rounded-md border border-border bg-bg px-3 text-text-muted shadow-sm transition-all duration-fast ease-smooth focus-within:border-accent focus-within:bg-bg-secondary focus-within:ring-2 focus-within:ring-[color:var(--ring)] hover:border-border-strong has-[:disabled]:bg-bg-secondary has-[:disabled]:opacity-70";

const labelClass = "mb-1.5 block text-[13px] font-medium text-text";

// 设置弹窗：读 get_config 回显，保存调 save_config（写 config.local.yaml；微信凭证变更会清 token 缓存）。
export default function SettingsDialog({open, onClose}: Props) {
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoaded(false);
    setShowSecret(false);
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
      width={520}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={handleSave}
            disabled={saving || !loaded}
            className="min-w-[86px] gap-2 shadow-[0_6px_16px_rgba(94,106,210,0.18)]"
          >
            <Save size={14} />
            {saving ? "保存中…" : "保存"}
          </Button>
        </>
      }
    >
      <section className="flex flex-col gap-4">
        <div className="overflow-hidden rounded-lg border border-border bg-bg-secondary">
          <div className="flex items-start gap-3 border-b border-border bg-bg px-4 py-4">
            <span className="mt-0.5 inline-flex h-9 w-9 flex-none items-center justify-center rounded-md bg-accent-subtle text-accent">
              <ShieldCheck size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="m-0 text-[15px] font-semibold leading-6 text-text">微信素材上传凭证</h2>
                <span className="rounded-sm bg-bg-secondary px-2 py-0.5 text-[11px] font-medium text-text-muted">
                  {loaded ? "本机配置" : "读取中"}
                </span>
              </div>
              <p className="m-0 mt-1 text-xs leading-5 text-text-secondary">
                用于上传图片到公众号素材库，凭证仅保存在本机配置文件。
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4 px-4 py-4">
            <div>
              <label htmlFor="settings-wechat-app-id" className={labelClass}>
                AppID
              </label>
              <div className={inputShellClass}>
                <KeyRound size={16} className="flex-none text-text-muted group-focus-within:text-accent" />
                <input
                  id="settings-wechat-app-id"
                  value={appId}
                  onChange={(e) => setAppId(e.target.value)}
                  placeholder="wx 开头的公众号 AppID"
                  disabled={!loaded}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label htmlFor="settings-wechat-app-secret" className={labelClass}>
                AppSecret
              </label>
              <div className={inputShellClass}>
                <LockKeyhole size={16} className="flex-none text-text-muted group-focus-within:text-accent" />
                <input
                  id="settings-wechat-app-secret"
                  value={appSecret}
                  onChange={(e) => setAppSecret(e.target.value)}
                  placeholder="公众号 AppSecret"
                  type={showSecret ? "text" : "password"}
                  disabled={!loaded}
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => setShowSecret((v) => !v)}
                  disabled={!loaded}
                  title={showSecret ? "隐藏 AppSecret" : "显示 AppSecret"}
                  aria-label={showSecret ? "隐藏 AppSecret" : "显示 AppSecret"}
                  className="inline-flex h-7 w-7 flex-none cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent text-text-muted transition-colors duration-fast hover:bg-bg-tertiary hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:cursor-default disabled:opacity-50"
                >
                  {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
          </div>
        </div>

        <p className="m-0 rounded-md border border-border bg-bg px-3 py-2.5 text-xs leading-5 text-text-secondary">
          可在「微信公众平台 → 设置与开发 → 基本配置」查看这两项凭证。
        </p>
      </section>
    </Dialog>
  );
}
