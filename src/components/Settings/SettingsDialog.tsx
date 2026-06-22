import {type MouseEvent, useEffect, useState} from "react";
import {invoke} from "@tauri-apps/api/core";
import {Check, Cloud, Copy, Eye, EyeOff, FolderSync, Info, KeyRound, LockKeyhole, Network, Save, ShieldCheck, UserRound} from "lucide-react";
import Dialog from "../ui/Dialog.tsx";
import {toast} from "../Toast/toast.ts";
import Button from "../ui/Button.tsx";
import {rememberOutboundIp} from "../../utils/outboundIpMonitor.ts";
import {copyPlainText} from "../../utils/clipboard.ts";
import {testSyncConnection} from "../../utils/cloudSync.ts";
import {isTauriRuntime} from "../../utils/tauriEnv.ts";
import ReleaseNotesView from "../Update/ReleaseNotesView.tsx";

interface Props {
  open: boolean;
  onClose: () => void;
  updateState?: SettingsUpdateState;
}

interface AppConfig {
  wechat: {
    app_id: string;
    app_secret: string;
  };
  sync?: {
    enabled: boolean;
    provider: string;
    username: string;
    password: string;
    remote_dir: string;
  };
}

const inputClass =
  "h-10 min-w-0 flex-1 border-0 bg-transparent text-sm text-text outline-none placeholder:text-text-muted disabled:cursor-default";

const inputShellClass =
  "group flex h-10 items-center gap-2 rounded border border-border bg-bg px-3 text-text-muted shadow-sm transition-all duration-fast ease-smooth focus-within:border-accent focus-within:bg-bg-secondary focus-within:ring-2 focus-within:ring-[color:var(--ring)] hover:border-border-strong has-[:disabled]:bg-bg-secondary has-[:disabled]:opacity-70";

const labelClass = "mb-1.5 block text-[13px] font-medium text-text";
const helpDocumentUrl = "https://my.feishu.cn/docx/RUDpd1zWnoWuuyx0uFxcahIGnmC";

type IpStatus = "idle" | "loading" | "ok" | "error";
type CopyStatus = "idle" | "ok" | "fail";
type SettingsSection = "wechat" | "sync" | "network" | "about";
type ConnectionStatus = "idle" | "loading" | "ok" | "error";

export interface SettingsUpdateState {
  status: "idle" | "checking" | "available" | "none" | "installing" | "error" | "unsupported";
  currentVersion: string;
  version?: string;
  body?: string;
  checking: boolean;
  installing: boolean;
  message: string;
  onCheck: () => void;
  onInstall: () => void;
}

// 设置弹窗：读 get_config 回显，保存调 save_config（写 config.local.yaml；微信凭证变更会清 token 缓存）。
export default function SettingsDialog({open, onClose, updateState}: Props) {
  const [activeSection, setActiveSection] = useState<SettingsSection>("wechat");
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [syncUsername, setSyncUsername] = useState("");
  const [syncPassword, setSyncPassword] = useState("");
  const [syncRemoteDir, setSyncRemoteDir] = useState("VellumStyle");
  const [showSyncPassword, setShowSyncPassword] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");
  const [connectionMessage, setConnectionMessage] = useState("");
  const [outboundIp, setOutboundIp] = useState("");
  const [ipStatus, setIpStatus] = useState<IpStatus>("idle");
  const [ipError, setIpError] = useState("");
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");

  useEffect(() => {
    if (!open) return;
    setLoaded(false);
    setActiveSection(updateState?.status === "available" ? "about" : "wechat");
    setShowSecret(false);
    setShowSyncPassword(false);
    setConnectionStatus("idle");
    setConnectionMessage("");
    setIpError("");
    setCopyStatus("idle");
    invoke<AppConfig>("get_config")
      .then((cfg) => {
        setAppId(cfg.wechat?.app_id || "");
        setAppSecret(cfg.wechat?.app_secret || "");
        setSyncEnabled(Boolean(cfg.sync?.enabled));
        setSyncUsername(cfg.sync?.username || "");
        setSyncPassword(cfg.sync?.password || "");
        setSyncRemoteDir(cfg.sync?.remote_dir || "VellumStyle");
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
        syncEnabled,
        syncProvider: "nutstore",
        syncUsername: syncUsername.trim(),
        syncPassword: syncPassword.trim(),
        syncRemoteDir: syncRemoteDir.trim() || "VellumStyle",
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

  const handleTestSyncConnection = async () => {
    if (connectionStatus === "loading") return;
    setConnectionStatus("loading");
    setConnectionMessage("");
    try {
      const result = await testSyncConnection({
        provider: "nutstore",
        username: syncUsername,
        password: syncPassword,
        remoteDir: syncRemoteDir,
      });
      setConnectionStatus("ok");
      setConnectionMessage(result.message || "连接成功");
      toast.show("坚果云连接成功", "info");
    } catch (e) {
      const msg = typeof e === "string" ? e : (e as Error)?.message || "连接失败";
      setConnectionStatus("error");
      setConnectionMessage(msg);
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

  const handleOpenHelpDocument = async (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    try {
      if (isTauriRuntime(window)) {
        await invoke("open_external_url", {url: helpDocumentUrl});
      } else {
        window.open(helpDocumentUrl, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      const msg = typeof e === "string" ? e : (e as Error)?.message || "打开帮助文档失败";
      toast.show(msg, "error");
    }
  };
  const releaseNotes = updateState?.body?.trim();
  const showUpdateMessage =
    updateState?.message &&
    (updateState.status === "error" || updateState.status === "unsupported" || updateState.status === "installing");

  return (
    <Dialog
      open={open}
      title="设置"
      width={760}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button
            type="button"
            variant="primary"
            state={saving ? "loading" : "idle"}
            loadingText="保存中…"
            onClick={handleSave}
            disabled={!loaded}
            className="min-w-[86px] gap-2"
          >
            <Save size={14} />
            保存
          </Button>
        </>
      }
    >
      <div className="grid min-h-[460px] grid-cols-[180px_minmax(0,1fr)] overflow-hidden rounded border border-border bg-bg-secondary">
        <nav className="flex flex-col gap-1 border-r border-border bg-bg-tertiary p-2" aria-label="设置分类">
          {[
            {id: "wechat" as const, label: "微信配置", hint: "素材上传", icon: ShieldCheck},
            {id: "sync" as const, label: "文件同步", hint: syncEnabled ? "坚果云 WebDAV" : "未启用", icon: Cloud},
            {id: "network" as const, label: "网络辅助", hint: "IP 白名单", icon: Network},
            {
              id: "about" as const,
              label: "关于",
              hint: updateState?.status === "available" ? "有新版本" : "版本更新",
              icon: Info,
            },
          ].map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveSection(item.id)}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-12 cursor-pointer items-center gap-2 rounded border-0 px-3 text-left transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] ${
                  active ? "bg-bg text-accent shadow-sm" : "bg-transparent text-text-secondary hover:bg-bg hover:text-text"
                }`}
              >
                <Icon size={16} className="flex-none" />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold leading-5">
                    {item.label}
                    {item.id === "about" && updateState?.status === "available" && (
                      <span className="h-1.5 w-1.5 rounded-full bg-danger" aria-label="有可用更新" />
                    )}
                  </span>
                  <span className="block truncate text-[11px] font-normal leading-4 text-text-muted">{item.hint}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <section className="min-w-0 overflow-y-auto bg-bg p-5">
          {activeSection === "wechat" && (
            <div className="mx-auto flex max-w-[520px] flex-col gap-5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-9 w-9 flex-none items-center justify-center rounded bg-accent-subtle text-accent">
                  <ShieldCheck size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="m-0 text-[16px] font-semibold leading-6 text-text">微信素材上传凭证</h2>
                    <span className="rounded-sm bg-bg-secondary px-2 py-0.5 text-[11px] font-medium text-text-muted">
                      {loaded ? "本机配置" : "读取中"}
                    </span>
                  </div>
                  <p className="m-0 mt-1 text-xs leading-5 text-text-secondary">
                    用于上传图片到公众号素材库，凭证仅保存在本机配置文件。
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-4">
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
          )}

          {activeSection === "sync" && (
            <div className="mx-auto flex max-w-[520px] flex-col gap-5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-9 w-9 flex-none items-center justify-center rounded bg-accent-subtle text-accent">
                  <Cloud size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="m-0 text-[16px] font-semibold leading-6 text-text">文件同步</h2>
                    <span className="rounded-sm bg-bg-secondary px-2 py-0.5 text-[11px] font-medium text-text-muted">
                      {syncEnabled ? "坚果云 WebDAV" : "未启用"}
                    </span>
                  </div>
                  <p className="m-0 mt-1 text-xs leading-5 text-text-secondary">
                    同步本机文档目录，坚果云请填写账号邮箱和第三方应用授权密码。
                  </p>
                </div>
              </div>

              <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded border border-border bg-bg-secondary px-3 text-sm text-text transition-colors duration-fast hover:border-border-strong">
                <input
                  type="checkbox"
                  checked={syncEnabled}
                  onChange={(e) => {
                    setSyncEnabled(e.target.checked);
                    setConnectionStatus("idle");
                    setConnectionMessage("");
                  }}
                  disabled={!loaded}
                  className="h-4 w-4 accent-[color:var(--accent)] disabled:cursor-default"
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">启用文件自同步</span>
                  <span className="block text-xs leading-5 text-text-secondary">本地保存不等待网络，同步在后台自动进行。</span>
                </span>
              </label>

              <div className="grid gap-4">
                <div>
                  <label htmlFor="settings-sync-username" className={labelClass}>
                    坚果云账号
                  </label>
                  <div className={inputShellClass}>
                    <UserRound size={16} className="flex-none text-text-muted group-focus-within:text-accent" />
                    <input
                      id="settings-sync-username"
                      value={syncUsername}
                      onChange={(e) => {
                        setSyncUsername(e.target.value);
                        setConnectionStatus("idle");
                        setConnectionMessage("");
                      }}
                      placeholder="坚果云登录邮箱"
                      disabled={!loaded || !syncEnabled}
                      autoComplete="username"
                      className={inputClass}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="settings-sync-password" className={labelClass}>
                    应用密码
                  </label>
                  <div className={inputShellClass}>
                    <LockKeyhole size={16} className="flex-none text-text-muted group-focus-within:text-accent" />
                    <input
                      id="settings-sync-password"
                      value={syncPassword}
                      onChange={(e) => {
                        setSyncPassword(e.target.value);
                        setConnectionStatus("idle");
                        setConnectionMessage("");
                      }}
                      placeholder="坚果云第三方应用授权密码"
                      type={showSyncPassword ? "text" : "password"}
                      disabled={!loaded || !syncEnabled}
                      autoComplete="current-password"
                      className={inputClass}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSyncPassword((v) => !v)}
                      disabled={!loaded || !syncEnabled}
                      title={showSyncPassword ? "隐藏应用密码" : "显示应用密码"}
                      aria-label={showSyncPassword ? "隐藏应用密码" : "显示应用密码"}
                      className="inline-flex h-7 w-7 flex-none cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent text-text-muted transition-colors duration-fast hover:bg-bg-tertiary hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:cursor-default disabled:opacity-50"
                    >
                      {showSyncPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="settings-sync-remote-dir" className={labelClass}>
                    同步目录
                  </label>
                  <div className={inputShellClass}>
                    <FolderSync size={16} className="flex-none text-text-muted group-focus-within:text-accent" />
                    <input
                      id="settings-sync-remote-dir"
                      value={syncRemoteDir}
                      onChange={(e) => {
                        setSyncRemoteDir(e.target.value);
                        setConnectionStatus("idle");
                        setConnectionMessage("");
                      }}
                      placeholder="VellumStyle"
                      disabled={!loaded || !syncEnabled}
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 rounded border border-border bg-bg-secondary px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold leading-5 text-text">连接验证</div>
                    <p className="m-0 text-xs leading-5 text-text-secondary">只验证账号和应用密码，不保存配置。</p>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    state={connectionStatus === "loading" ? "loading" : connectionStatus === "ok" ? "success" : connectionStatus === "error" ? "error" : "idle"}
                    loadingText="测试中…"
                    successText="已连接"
                    errorText="连接失败"
                    onClick={() => void handleTestSyncConnection()}
                    disabled={!loaded || !syncEnabled}
                    className="gap-2"
                  >
                    测试连接
                  </Button>
                </div>
                {connectionMessage && (
                  <p
                    className={`m-0 text-xs leading-5 ${
                      connectionStatus === "ok" ? "text-success" : connectionStatus === "error" ? "text-danger" : "text-text-secondary"
                    }`}
                    role={connectionStatus === "error" ? "alert" : undefined}
                  >
                    {connectionMessage}
                  </p>
                )}
              </div>
            </div>
          )}

          {activeSection === "network" && (
            <div className="mx-auto flex max-w-[520px] flex-col gap-5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-9 w-9 flex-none items-center justify-center rounded bg-accent-subtle text-accent">
                  <Network size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="m-0 text-[16px] font-semibold leading-6 text-text">IP 白名单辅助</h2>
                  <p className="m-0 mt-1 text-xs leading-5 text-text-secondary">
                    可在「微信开发者平台 → 登录并点击右上角头像 → 账号管理 → 公众号 → 前往公众号详情页 → 基础信息」即可看到开发密钥栏的，API IP 白名单，点击编辑并把当前出口 IP
                    填入白名单。如果不会操作，可打开{" "}
                    <a
                      href={helpDocumentUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => void handleOpenHelpDocument(event)}
                      className="font-medium text-accent underline decoration-[color:var(--accent)]/40 underline-offset-2 transition-colors duration-fast hover:text-accent-hover"
                    >
                      VellumStyle-文澜排版帮助文档
                    </a>
                    ，里面有详细的操作步骤。
                  </p>
                </div>
              </div>

              <div className="grid w-full min-w-0 gap-3">
                <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_2.25rem] items-center gap-2">
                  <span
                    className={`box-border inline-flex h-9 w-full min-w-0 items-center rounded-sm border border-border bg-bg-secondary px-2 font-mono text-[12px] leading-none tabular-nums ${
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
                    className={`inline-flex h-9 w-9 flex-none cursor-pointer items-center justify-center rounded-sm border border-border bg-bg-secondary text-text-muted transition-colors duration-fast hover:border-border-strong hover:bg-bg-tertiary hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:cursor-default disabled:opacity-50 ${
                      copyStatus === "ok" ? "!border-success !bg-success !text-white" : ""
                    }`}
                  >
                    {copyStatus === "ok" ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  state={ipStatus === "loading" ? "loading" : ipStatus === "error" ? "error" : "idle"}
                  loadingText="获取中…"
                  onClick={() => void handleFetchOutboundIp()}
                  className="w-full min-w-0 gap-2 px-2"
                >
                  获取出口 IP
                </Button>
                {ipError && <p className="m-0 text-[12px] leading-5 text-danger" role="alert">{ipError}</p>}
              </div>
            </div>
          )}

          {activeSection === "about" && (
            <div className="mx-auto flex max-w-[520px] flex-col gap-5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-9 w-9 flex-none items-center justify-center rounded bg-accent-subtle text-accent">
                  <Info size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="m-0 text-[16px] font-semibold leading-6 text-text">VellumStyle</h2>
                    <span className="rounded-sm bg-bg-secondary px-2 py-0.5 text-[11px] font-medium text-text-muted">
                      文澜排版
                    </span>
                  </div>
                  <p className="m-0 mt-1 text-xs leading-5 text-text-secondary">
                    本地优先的 Markdown 到微信公众号排版桌面工具。
                  </p>
                </div>
              </div>

              <div className="rounded border border-border bg-bg shadow-sm">
                <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
                  <span className="text-[13px] font-medium text-text-secondary">当前版本</span>
                  <span className="font-mono text-[13px] text-text">{updateState?.currentVersion || "—"}</span>
                </div>
                {updateState?.status === "available" && (
                  <div className="flex items-center justify-between border-b border-border bg-danger/5 px-3 py-2.5">
                    <span className="text-[13px] font-medium text-danger">最新版本</span>
                    <span className="font-mono text-[13px] text-danger">{updateState.version}</span>
                  </div>
                )}
                <div className="flex items-center justify-between px-3 py-2.5">
                  <span className="text-[13px] font-medium text-text-secondary">更新状态</span>
                  <span className={`text-[13px] font-medium ${updateState?.status === "available" ? "text-danger" : "text-text"}`}>
                    {formatUpdateStatus(updateState)}
                  </span>
                </div>
              </div>

              {updateState?.status === "available" && releaseNotes && (
                <div className="rounded border border-border bg-bg shadow-sm">
                  <div className="border-b border-border px-3 py-2.5">
                    <div className="text-[13px] font-semibold leading-5 text-text">更新内容</div>
                  </div>
                  <div className="max-h-48 overflow-y-auto px-3 py-2.5 editor-preview-scrollbar">
                    <ReleaseNotesView markdown={releaseNotes} />
                  </div>
                </div>
              )}

              {showUpdateMessage && (
                <div
                  className={`rounded border px-3 py-2.5 text-[13px] leading-5 ${
                    updateState.status === "error"
                      ? "border-danger/25 bg-danger/5 text-danger"
                      : "border-border bg-bg-secondary text-text-secondary"
                  }`}
                  role={updateState.status === "error" ? "alert" : undefined}
                >
                  {updateState.message}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {updateState?.status !== "available" && (
                  <Button
                    type="button"
                    variant="secondary"
                    state={updateState?.checking ? "loading" : "idle"}
                    loadingText="检查中…"
                    onClick={updateState?.onCheck}
                    disabled={!updateState || updateState.installing}
                    className="min-w-[94px] gap-2"
                  >
                    检查更新
                  </Button>
                )}
                {updateState?.status === "available" && (
                  <Button
                    type="button"
                    variant="primary"
                    state={updateState?.installing ? "loading" : "idle"}
                    loadingText="更新中…"
                    onClick={updateState?.onInstall}
                    disabled={!updateState}
                    className="min-w-[94px] gap-2"
                  >
                    立即更新
                  </Button>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </Dialog>
  );
}

function formatUpdateStatus(updateState?: SettingsUpdateState): string {
  if (!updateState) return "未检查";
  switch (updateState.status) {
    case "checking":
      return "正在检查";
    case "available":
      return "发现新版本";
    case "installing":
      return "正在更新";
    case "none":
      return "已是最新版本";
    case "error":
      return "检查失败";
    case "unsupported":
      return "当前环境不支持";
    case "idle":
      return "未检查";
  }
}
