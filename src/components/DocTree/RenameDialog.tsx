import {createPortal} from "react-dom";
import {useCallback, useEffect, useRef, useState} from "react";
import {motion} from "framer-motion";
import {FileText, Folder, Pencil} from "lucide-react";
import {MOTION_DURATION_FAST, MOTION_SPRING_POP} from "../../utils/motion.ts";
import {entryBasename, entryExtension} from "../../utils/documents.ts";
import Button from "../ui/Button.tsx";
import {useDialogEscape} from "../ui/useDialogEscape.ts";
import {isUnchangedRename, type RenameSession} from "./renameSession.ts";

interface Props {
  node: {name: string; path: string; isDir: boolean} | null;
  session: RenameSession | null;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}

// 重命名弹层：占满窗口的遮罩 + 居中输入。
// 核心诉求是"输入期间鼠标怎么动都不会丢掉已输入内容"，因此：
// - 点遮罩/弹层外只在有未保存改动时提示一句（并给"放弃修改"入口），绝不静默关闭；
// - 只有 Esc、取消按钮、明确点"放弃修改"才会退出；
// - 弹层外的按下被捕获阶段拦下，焦点始终留在输入框，不会"以为在输入、其实打到了编辑器"。
export default function RenameDialog({node, session, onChange, onCommit, onCancel}: Props) {
  const open = node !== null && session !== null;
  const inputRef = useRef<HTMLInputElement>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const draft = session?.value ?? "";
  const trimmed = draft.trim();
  // 与目标节点当前名一致（文件只打主名也算没改）→ 视为"没有改动"。
  const dirty = node !== null && trimmed !== "" && !isUnchangedRename(node, trimmed);
  const canSubmit = open && !session?.pending && !session?.error && dirty;

  // useDialogEscape 的 effect 依赖 onClose：回调必须引用稳定，
  // 否则每次渲染都重装监听，Escape 里的 setState 会导致 effect 反复重装（卡死）。
  // Esc 在两步确认态下先退回编辑；正常态直接取消（用户按 Esc 就是要退出）。
  const closeStateRef = useRef({confirming: false});
  closeStateRef.current = {confirming: confirmDiscard};

  const handleEscape = useCallback(() => {
    if (closeStateRef.current.confirming) {
      setConfirmDiscard(false);
      return;
    }
    onCancel();
  }, [onCancel]);

  useDialogEscape(handleEscape, open);

  // 两步确认态切换后把焦点交回输入框：确认面板出现/消失（点"继续编辑"）都不打断输入。
  useEffect(() => {
    if (!open || confirmDiscard) return;
    const input = inputRef.current;
    if (!input || document.activeElement === input) return;
    // 只有焦点落在弹层按钮上时才交还，避免抢走用户主动点出去的焦点。
    const active = document.activeElement;
    if (active instanceof Element && active.closest('[role="dialog"]')) {
      input.focus();
    }
  }, [open, confirmDiscard]);

  // 焦点守卫：遮罩挡住了下层界面，点击弹层外的任何位置都不该把焦点从输入框带走，
  // 否则用户会"以为在输入、其实打到了编辑器"。这里在捕获阶段拦下弹层外的按下。
  useEffect(() => {
    if (!open) return;
    const onPointerDownCapture = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[role="dialog"]')) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener("mousedown", onPointerDownCapture, true);
    return () => document.removeEventListener("mousedown", onPointerDownCapture, true);
  }, [open]);

  // 每次打开时重置确认态并聚焦、选中主名（不含扩展名）。
  useEffect(() => {
    if (!open) {
      setConfirmDiscard(false);
      return;
    }
    const input = inputRef.current;
    if (!input) return;
    input.focus();
    input.select();
    // 仅依赖 open：后续输入不应重置选区。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 点遮罩：有未保存改动时只提示（不关闭），没有改动时等同于取消。
  const requestClose = () => {
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    onCancel();
  };

  return createPortal(
    // 不用 AnimatePresence：改名弹层经常被"关闭后立刻重开"（连续改名），
    // 退出动画被打断后容易残留悬挂的动画帧；这里只保留入场动画，关闭即卸载。
    open && node && session ? (
        <motion.div
          className="vs-overlay-blur fixed inset-0 z-[2000] flex items-center justify-center px-4"
          style={{background: "rgba(20,20,30,0.42)"}}
          initial={{opacity: 0}}
          animate={{opacity: 1}}
          transition={{duration: MOTION_DURATION_FAST}}
          onClick={requestClose}
        >
          <motion.div
            className="flex w-[440px] max-w-full flex-col overflow-hidden rounded-lg border border-border bg-bg shadow-lg"
            initial={{opacity: 0, scale: 0.96, y: 10}}
            animate={{opacity: 1, scale: 1, y: 0}}
            transition={MOTION_SPRING_POP}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rename-dialog-title"
          >
            <div className="flex shrink-0 items-start gap-3 bg-bg-secondary/70 px-5 pb-3 pt-4">
              <div className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-bg-tertiary text-text-secondary">
                {node.isDir ? <Folder size={18} /> : <FileText size={18} />}
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="rename-dialog-title" className="m-0 text-[18px] font-semibold leading-6 text-text">
                  {node.isDir ? "重命名文件夹" : "重命名文档"}
                </h2>
              </div>
            </div>

            <form
              className="px-5 pb-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (canSubmit) onCommit();
              }}
            >
              <div className="flex items-center gap-2">
                <input
                  id="rename-dialog-input"
                  ref={inputRef}
                  value={draft}
                  disabled={session.pending}
                  spellCheck={false}
                  autoComplete="off"
                  aria-label={node.isDir ? "文件夹名" : "文档名"}
                  aria-invalid={session.error ? true : undefined}
                  aria-describedby={session.error || confirmDiscard ? "rename-dialog-note" : undefined}
                  onChange={(event) => {
                    setConfirmDiscard(false);
                    onChange(event.target.value);
                  }}
                  onKeyDown={(event) => {
                    // 显式处理回车，不依赖表单隐式提交（WebView 与测试环境行为不一致）。
                    if (event.key === "Enter") {
                      event.preventDefault();
                      if (canSubmit) onCommit();
                    }
                  }}
                  className={`h-9 min-w-0 flex-1 rounded-md border bg-bg-secondary px-3 text-sm2 text-text outline-none transition-colors duration-fast focus:ring-2 focus:ring-[color:var(--ring)] disabled:opacity-60 ${
                    session.error ? "border-danger" : "border-border focus:border-accent"
                  }`}
                />
                {!node.isDir && (
                  <span className="shrink-0 text-sm2 text-text-muted">{entryExtension(entryBasename(node.path)) || ".md"}</span>
                )}
              </div>
              {/* 只在出错或需要"放弃修改"确认时占位，平时保持紧凑 */}
              {(session.error || confirmDiscard) && (
                <div
                  id="rename-dialog-note"
                  className={`mt-1.5 break-words text-xs2 leading-4 ${
                    session.error ? "text-danger" : "text-text-muted"
                  }`}
                  role={session.error ? "alert" : undefined}
                >
                  {session.error ?? "未提交的修改不会保存，点「放弃修改」退出"}
                </div>
              )}
            </form>

            <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-3">
              {confirmDiscard ? (
                <>
                  <Button type="button" variant="secondary" onClick={() => setConfirmDiscard(false)}>
                    继续编辑
                  </Button>
                  <Button type="button" variant="primary" className="bg-danger hover:bg-danger/90" onClick={onCancel}>
                    放弃修改
                  </Button>
                </>
              ) : (
                <>
                  <Button type="button" variant="secondary" onClick={requestClose}>
                    取消
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    className="gap-2"
                    disabled={!canSubmit}
                    state={session.pending ? "loading" : "idle"}
                    loadingText="重命名中"
                    onClick={onCommit}
                  >
                    <Pencil size={14} />
                    重命名
                  </Button>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      ) : null,
    document.body,
  );
}
