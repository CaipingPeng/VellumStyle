import {useEffect, useRef, useState} from "react";
import {invoke} from "@tauri-apps/api/core";
import {createPortal} from "react-dom";
import {AnimatePresence, motion} from "framer-motion";
import {AlertTriangle, ArrowRight, Check, Copy, ExternalLink, Info, X} from "lucide-react";
import Button from "../ui/Button.tsx";
import {copyPlainText} from "../../utils/clipboard.ts";
import {buildWechatWhitelistUrl} from "../../utils/wechatWhitelist.ts";
import {isTauriRuntime} from "../../utils/tauriEnv.ts";
import {toast} from "../Toast/toast.ts";

interface AppConfig {
  wechat?: {app_id?: string};
}

interface Props {
  open: boolean;
  previousIp: string;
  currentIp: string;
  onClose: () => void;
}

const STEPS = [
  {label: "登录", emphasis: "微信开发者平台"},
  {label: "右上角头像 → 账号管理", emphasis: ""},
  {label: "公众号 → 详情页", emphasis: ""},
  {label: "基础信息 → IP 白名单", emphasis: ""},
  {label: "添加当前出口 IP 并保存", emphasis: ""},
];

export default function IpChangedDialog({open, previousIp, currentIp, onClose}: Props) {
  const [copied, setCopied] = useState(false);
  const [openingWhitelist, setOpeningWhitelist] = useState(false);
  const copiedTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    return () => {
      if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
    };
  }, []);

  // 每次打开时重置复制反馈，避免上次的"已复制"态残留。
  useEffect(() => {
    if (open) setCopied(false);
  }, [open]);

  const handleCopy = async () => {
    const ok = await copyPlainText(currentIp);
    if (ok) {
      setCopied(true);
      if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(false), 1900);
    }
  };

  const handleOpenWhitelist = async () => {
    if (openingWhitelist) return;
    setOpeningWhitelist(true);
    try {
      const copiedNow = await copyPlainText(currentIp);
      if (copiedNow) setCopied(true);
      const cfg = await invoke<AppConfig>("get_config");
      const url = buildWechatWhitelistUrl(cfg.wechat?.app_id || "");
      if (isTauriRuntime(window)) {
        await invoke("open_external_url", {url});
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
      if (!copiedNow) toast.show("未能自动复制新出口 IP，请返回后手动复制", "error");
    } catch (e) {
      const msg = typeof e === "string" ? e : (e as Error)?.message || "打开微信白名单设置失败";
      toast.show(msg, "error");
    } finally {
      setOpeningWhitelist(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[2000] flex items-center justify-center px-4"
          style={{background: "rgba(20,20,30,0.42)"}}
          initial={{opacity: 0}}
          animate={{opacity: 1}}
          exit={{opacity: 0}}
          transition={{duration: 0.13}}
          onClick={onClose}
        >
          <motion.div
            className="flex max-h-[88vh] w-[464px] max-w-full flex-col overflow-hidden rounded-lg border border-border bg-bg shadow-lg"
            initial={{opacity: 0, scale: 0.96, y: 10}}
            animate={{opacity: 1, scale: 1, y: 0}}
            exit={{opacity: 0, scale: 0.96, y: 10}}
            transition={{duration: 0.16, ease: [0.16, 1, 0.3, 1]}}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ip-changed-title"
          >
            {/* 头部：警示图标 + 标题 + 后果说明 + 关闭 */}
            <div className="flex shrink-0 items-start gap-3 border-b border-border px-5 py-4">
              <div className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color:rgba(183,121,31,0.1)] text-warning">
                <AlertTriangle size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="ip-changed-title" className="m-0 text-[16px] font-semibold leading-6 text-text">
                  出口 IP 已变更
                </h2>
                <p className="m-0 mt-1 text-xs leading-5 text-text-secondary">
                  出口 IP 变化后公众号接口调用可能失败，请更新 IP 白名单。
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                title="关闭"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border-0 bg-transparent text-text-muted cursor-pointer transition-colors duration-fast hover:bg-bg-tertiary hover:text-text"
              >
                <X size={16} />
              </button>
            </div>

            {/* 正文：IP 对比 + 步骤 + 提示 */}
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 editor-preview-scrollbar">
              {/* 新旧 IP 对比卡 */}
              <div className="flex items-stretch gap-2.5 rounded border border-border bg-bg-secondary p-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-[11px] leading-none text-text-muted">变更前</span>
                  <span className="truncate font-mono text-[13px] leading-5 text-text-muted line-through">
                    {previousIp || "—"}
                  </span>
                </div>
                <div className="flex items-center text-text-muted">
                  <ArrowRight size={16} />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-[11px] leading-none text-text-secondary">当前出口 IP</span>
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-mono text-[15px] font-semibold leading-5 text-accent">
                      {currentIp}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopy}
                      title="复制当前出口 IP"
                      aria-label="复制当前出口 IP"
                      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border-0 bg-transparent text-text-muted cursor-pointer transition-colors duration-fast hover:bg-bg-tertiary hover:text-text"
                    >
                      {copied ? <Check size={13} /> : <Copy size={13} />}
                    </button>
                  </div>
                </div>
              </div>

              {/* 更新步骤 */}
              <div className="mt-4">
                <div className="mb-2 text-[13px] font-semibold leading-5 text-text">更新白名单步骤</div>
                <ol className="m-0 flex flex-col gap-1.5 p-0">
                  {STEPS.map((step, i) => (
                    <li key={i} className="flex items-start gap-2.5">
                      <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-[11px] font-semibold leading-none text-accent">
                        {i + 1}
                      </span>
                      <span className="text-[13px] leading-5 text-text-secondary">
                        {step.label}
                        {step.emphasis && <b className="font-semibold text-text">{step.emphasis}</b>}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* 提示条 */}
              <div className="mt-3 flex items-start gap-2 rounded border border-border bg-bg-tertiary px-3 py-2.5 text-[12.5px] leading-5 text-text-secondary">
                <Info size={15} className="mt-0.5 shrink-0 text-text-muted" />
                <span>更新白名单后即可正常调用公众号接口，无需重启本软件。</span>
              </div>
            </div>

            {/* 底部按钮 */}
            <div className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3">
              <Button type="button" variant="secondary" onClick={onClose}>
                稍后处理
              </Button>
              <Button
                type="button"
                variant="secondary"
                state={copied ? "success" : "idle"}
                successText={`已复制 ${currentIp}`}
                onClick={handleCopy}
                className="min-w-[120px] gap-1.5"
              >
                <Copy size={14} />
                复制新出口 IP
              </Button>
              <Button
                type="button"
                variant="primary"
                state={openingWhitelist ? "loading" : "idle"}
                loadingText="正在打开…"
                onClick={() => void handleOpenWhitelist()}
                className="min-w-[132px] gap-1.5"
              >
                <ExternalLink size={14} />
                前往设置白名单
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
