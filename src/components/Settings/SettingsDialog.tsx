import {useEffect, useState} from "react";
import {invoke} from "@tauri-apps/api/core";
import {Check, Copy, Eye, EyeOff, KeyRound, LockKeyhole, Network, RefreshCw, Save, ShieldCheck} from "lucide-react";
import Dialog from "../ui/Dialog.tsx";
import {toast} from "../Toast/toast.ts";
import Button from "../ui/Button.tsx";
import {rememberOutboundIp} from "../../utils/outboundIpMonitor.ts";

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

type IpStatus = "idle" | "loading" | "ok" | "error";
type CopyStatus = "idle" | "ok" | "fail";

async function copyPlainText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Continue to the selection fallback below.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-1000px";
  textarea.style.top = "-1000px";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

// 设置弹窗：读 get_config 回显，保存调 save_config（写 config.local.yaml；微信凭证变更会清 token 缓存）。
export default function SettingsDialog({open, onClose}: Props) {
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [outboundIp, setOutboundIp] = useState("");
  const [ipStatus, setIpStatus] = useState<IpStatus>("idle");
  const [ipError, setIpError] = useState("");
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");

  useEffect(() => {
    if (!open) return;
    setLoaded(false);
    setShowSecret(false);
    setIpError("");
    setCopyStatus("idle");
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

  const handleFetchOutboundIp = async () => {
    if (ipStatus === "loading") return;
    setIpStatus("loading");
    setIpError("");
    setCopyStatus("idle");
    try {
      const ip = await invoke<string>("get_outbound_ip");
      rememberOutboundIp(ip);
      setOutboundIp(ip);
      setIpStatus("ok");
      toast.show("已获取当前出口 IP", "info");
    } catch (e) {
      const msg = typeof e === "string" ? e : (e as Error)?.message || "获取出口 IP 失败";
      setIpStatus("error");
      setIpError(msg);
      toast.show(msg, "error");
    }
  };

  const handleCopyOutboundIp = async () => {
    if (!outboundIp) return;
    const ok = await copyPlainText(outboundIp);
    setCopyStatus(ok ? "ok" : "fail");
    toast.show(ok ? "出口 IP 已复制" : "复制出口 IP 失败", ok ? "info" : "error");
    window.setTimeout(() => setCopyStatus("idle"), 1800);
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

        <div className="rounded-md border border-border bg-bg px-3 py-3 text-xs leading-5 text-text-secondary">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-1 items-start gap-2.5">
              <span className="mt-0.5 inline-flex h-7 w-7 flex-none items-center justify-center rounded-sm bg-accent-subtle text-accent">
                <Network size={15} />
              </span>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold leading-5 text-text">IP 白名单辅助</div>
                <p className="m-0 mt-0.5">
                  可在「微信公众平台 → 设置与开发 → 基本配置」查看凭证，并把当前出口 IP 填入白名单。
                </p>
              </div>
            </div>

            <div className="grid min-w-0 flex-none gap-2" style={{width: 204, maxWidth: "100%"}}>
              <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_2rem] items-center gap-2">
                <span
                  className={`box-border inline-flex h-8 w-full min-w-0 items-center rounded-sm border border-border bg-bg-secondary px-2 font-mono text-[12px] leading-none tabular-nums ${
                    outboundIp ? "text-text" : "text-text-muted"
                  }`}
                >
                  {outboundIp || "IPv4 待获取"}
                </span>
                <button
                  type="button"
                  onClick={() => void handleCopyOutboundIp()}
                  disabled={!outboundIp}
                  title="复制 IPv4"
                  aria-label="复制 IPv4"
                  className={`inline-flex h-8 w-8 flex-none cursor-pointer items-center justify-center rounded-sm border border-border bg-bg-secondary text-text-muted transition-colors duration-fast hover:border-border-strong hover:bg-bg-tertiary hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:cursor-default disabled:opacity-50 ${
                    copyStatus === "ok" ? "!border-success !bg-success !text-white" : ""
                  }`}
                >
                  {copyStatus === "ok" ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
              <div className="grid w-full min-w-0 grid-cols-1">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void handleFetchOutboundIp()}
                  disabled={ipStatus === "loading"}
                  className="w-full min-w-0 gap-2 px-2"
                >
                  <RefreshCw size={14} className={ipStatus === "loading" ? "animate-spin" : ""} />
                  {ipStatus === "loading" ? "获取中…" : "获取出口 IP"}
                </Button>
              </div>
              {ipError && <p className="m-0 text-[12px] leading-5 text-danger">{ipError}</p>}
            </div>
          </div>
        </div>
      </section>
    </Dialog>
  );
}
