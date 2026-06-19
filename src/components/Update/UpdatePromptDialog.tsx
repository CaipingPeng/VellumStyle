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
            className="flex max-h-[88vh] w-[520px] max-w-full flex-col overflow-hidden rounded-lg border border-border bg-bg shadow-lg"
            initial={{opacity: 0, scale: 0.96, y: 10}}
            animate={{opacity: 1, scale: 1, y: 0}}
            exit={{opacity: 0, scale: 0.96, y: 10}}
            transition={{duration: 0.16, ease: [0.16, 1, 0.3, 1]}}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="update-prompt-title"
          >
            <div className="flex shrink-0 items-start gap-3 border-b border-border px-5 py-5">
              <div className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent-subtle text-accent">
                <Download size={19} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium leading-5 text-text-secondary">
                  VellumStyle {formatVersionLabel(version)}
                </div>
                <h2 id="update-prompt-title" className="m-0 mt-0.5 text-[20px] font-semibold leading-7 text-text">
                  新版本已准备好
                </h2>
                <p className="m-0 mt-1 text-[13px] leading-5 text-text-secondary">
                  当前版本 {formatVersionLabel(currentVersion)}，安装完成后应用会自动重启。
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={installing}
                title="关闭"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border-0 bg-transparent text-text-muted cursor-pointer transition-colors duration-fast hover:bg-bg-tertiary hover:text-text disabled:cursor-default disabled:opacity-40"
              >
                <X size={17} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 editor-preview-scrollbar">
              {trimmedNotes && (
                <section>
                  <div className="mb-2 text-[13px] font-semibold leading-5 text-text">更新内容</div>
                  <div className="max-h-52 overflow-y-auto rounded-md border border-border bg-bg-secondary px-4 py-3 editor-preview-scrollbar">
                    <ReleaseNotesView markdown={trimmedNotes} />
                  </div>
                </section>
              )}

              {statusMessage && (
                <p
                  className={`m-0 ${trimmedNotes ? "mt-3" : ""} rounded-md border px-3 py-2 text-xs leading-5 ${
                    installing
                      ? "border-border bg-accent-subtle text-text-secondary"
                      : "border-danger/25 bg-danger/5 text-danger"
                  }`}
                  role={installing ? "status" : "alert"}
                >
                  {statusMessage}
                </p>
              )}
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-4">
              <Button type="button" variant="secondary" onClick={onClose} disabled={installing}>
                稍后再说
              </Button>
              <Button type="button" variant="primary" onClick={onInstall} disabled={installing} className="gap-2">
                <Download size={14} className={installing ? "animate-pulse" : ""} />
                {installing ? "更新中…" : "立即更新"}
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
