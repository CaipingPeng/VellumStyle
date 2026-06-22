import {createPortal} from "react-dom";
import {AnimatePresence, motion} from "framer-motion";
import {Download, X} from "lucide-react";
import Button from "../ui/Button.tsx";
import ReleaseNotesView from "./ReleaseNotesView.tsx";

interface Props {
  open: boolean;
  version?: string;
  currentVersion?: string;
  releaseNotes?: string;
  message?: string;
  installing: boolean;
  onClose: () => void;
  onInstall: () => void;
}

export default function UpdatePromptDialog({
  open,
  version,
  currentVersion,
  releaseNotes,
  message,
  installing,
  onClose,
  onInstall,
}: Props) {
  const trimmedNotes = releaseNotes?.trim();
  const statusMessage = getVisibleStatusMessage(message, version, installing);

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
          onClick={installing ? undefined : onClose}
        >
          <motion.div
            className="flex max-h-[88vh] w-[520px] max-w-full flex-col overflow-hidden rounded border border-border bg-bg shadow-md"
            initial={{opacity: 0, scale: 0.96, y: 10}}
            animate={{opacity: 1, scale: 1, y: 0}}
            exit={{opacity: 0, scale: 0.96, y: 10}}
            transition={{duration: 0.16, ease: [0.16, 1, 0.3, 1]}}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="update-prompt-title"
          >
            <div className="flex shrink-0 items-start gap-3 border-b border-border px-5 py-4">
              <div className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded bg-accent-subtle text-accent">
                <Download size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="update-prompt-title" className="m-0 text-[16px] font-semibold leading-6 text-text">
                  发现新版本
                </h2>
                <p className="m-0 mt-1 text-xs leading-5 text-text-secondary">
                  当前 {formatVersionLabel(currentVersion)} → 最新 {formatVersionLabel(version)}，安装后自动重启。
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={installing}
                title="关闭"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm border-0 bg-transparent text-text-muted cursor-pointer transition-colors duration-fast hover:bg-bg-tertiary hover:text-text disabled:cursor-default disabled:opacity-40"
              >
                <X size={16} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 editor-preview-scrollbar">
              {trimmedNotes && (
                <section>
                  <div className="max-h-52 overflow-y-auto rounded border border-border bg-bg px-4 py-3 shadow-sm editor-preview-scrollbar">
                    <ReleaseNotesView markdown={trimmedNotes} />
                  </div>
                </section>
              )}

              {statusMessage && (
                <div
                  className={`${trimmedNotes ? "mt-3" : ""} rounded border px-3 py-2.5 text-[13px] leading-5 ${
                    installing
                      ? "border-border bg-accent-subtle text-text-secondary"
                      : "border-danger/25 bg-danger/5 text-danger"
                  }`}
                  role={installing ? "status" : "alert"}
                >
                  {statusMessage}
                </div>
              )}
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3">
              <Button type="button" variant="secondary" onClick={onClose} disabled={installing}>
                稍后再说
              </Button>
              <Button
                type="button"
                variant="primary"
                state={installing ? "loading" : "idle"}
                loadingText="更新中…"
                onClick={onInstall}
                disabled={installing}
                className="min-w-[94px] gap-2"
              >
                <Download size={14} />
                立即更新
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function formatVersionLabel(version?: string): string {
  const value = version?.trim();
  if (!value) return "读取中";
  return value.toLowerCase().startsWith("v") ? value : `v${value}`;
}

function getVisibleStatusMessage(message?: string, version?: string, installing?: boolean): string {
  const value = message?.trim();
  if (!value) return "";

  const readyMessage = version ? `新版本 ${version} 已准备好下载。` : "";
  if (!installing && readyMessage && value === readyMessage) return "";
  return value;
}
