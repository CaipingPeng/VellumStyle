import type {ReactNode} from "react";
import {createPortal} from "react-dom";
import {AnimatePresence, motion} from "framer-motion";
import {X} from "lucide-react";
import {MOTION_DURATION_FAST, MOTION_SPRING_POP} from "../../utils/motion.ts";

interface Props {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  /** 点遮罩是否关闭，默认 true。发布对话框传 false（已知需求）。 */
  closeOnOverlay?: boolean;
  /** 禁用所有内建关闭入口；默认 false，不影响现有调用方。 */
  closeDisabled?: boolean;
  width?: number | string;
  children: ReactNode;
  footer?: ReactNode;
  headerActions?: ReactNode;
  contentPadding?: boolean;
}

export default function Dialog({
  open,
  title,
  onClose,
  closeOnOverlay = true,
  closeDisabled = false,
  width = 440,
  children,
  footer,
  headerActions,
  contentPadding = true,
}: Props) {
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[2000] flex items-center justify-center"
          style={{background: "rgba(20,20,30,0.4)"}}
          initial={{opacity: 0}}
          animate={{opacity: 1}}
          exit={{opacity: 0}}
          transition={{duration: MOTION_DURATION_FAST}}
          onClick={closeOnOverlay && !closeDisabled ? onClose : undefined}
        >
          <motion.div
            className="flex max-h-[86vh] flex-col overflow-hidden rounded bg-bg shadow-md"
            style={{width, maxWidth: "90vw"}}
            initial={{opacity: 0, scale: 0.96, y: 8}}
            animate={{opacity: 1, scale: 1, y: 0}}
            exit={{opacity: 0, scale: 0.96, y: 8}}
            transition={MOTION_SPRING_POP}
            onClick={(e) => e.stopPropagation()}
          >
            <div data-dialog-header className="flex min-h-11 shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-1.5 text-sm font-semibold text-text">
              <span className="min-w-0">{title}</span>
              <div className="flex flex-none items-center gap-2">
                {headerActions}
                <button
                  type="button"
                  onClick={onClose}
                  disabled={closeDisabled}
                  aria-disabled={closeDisabled || undefined}
                  title="关闭"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-sm border-0 bg-transparent text-text-muted cursor-pointer transition-colors duration-fast outline-none hover:bg-bg-tertiary hover:text-text focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-text-muted"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className={`min-h-0 flex-1 ${contentPadding ? "overflow-y-auto p-4" : "overflow-hidden"}`}>{children}</div>
            {footer && <div className="flex shrink-0 justify-end gap-2 border-t border-border px-4 py-3">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
