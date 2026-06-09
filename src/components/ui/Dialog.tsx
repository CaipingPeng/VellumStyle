import type {ReactNode} from "react";
import {AnimatePresence, motion} from "framer-motion";
import {X} from "lucide-react";

interface Props {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  /** 点遮罩是否关闭，默认 true。发布对话框传 false（已知需求）。 */
  closeOnOverlay?: boolean;
  width?: number;
  children: ReactNode;
  footer?: ReactNode;
}

export default function Dialog({open, title, onClose, closeOnOverlay = true, width = 440, children, footer}: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center"
          style={{background: "rgba(20,20,30,0.4)", backdropFilter: "blur(2px)"}}
          initial={{opacity: 0}}
          animate={{opacity: 1}}
          exit={{opacity: 0}}
          transition={{duration: 0.13}}
          onClick={closeOnOverlay ? onClose : undefined}
        >
          <motion.div
            className="overflow-hidden rounded-lg bg-bg shadow-lg"
            style={{width, maxWidth: "90%"}}
            initial={{opacity: 0, scale: 0.96, y: 8}}
            animate={{opacity: 1, scale: 1, y: 0}}
            exit={{opacity: 0, scale: 0.96, y: 8}}
            transition={{duration: 0.13, ease: [0.16, 1, 0.3, 1]}}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex h-11 items-center justify-between border-b border-border px-4 text-sm font-semibold text-text">
              <span>{title}</span>
              <button
                type="button"
                onClick={onClose}
                title="关闭"
                className="inline-flex h-7 w-7 items-center justify-center rounded-sm border-0 bg-transparent text-text-muted cursor-pointer transition-colors duration-fast hover:bg-bg-tertiary hover:text-text"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-4">{children}</div>
            {footer && <div className="flex justify-end gap-2 px-4 pb-4">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
