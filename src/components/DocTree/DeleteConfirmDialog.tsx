import {createPortal} from "react-dom";
import {AnimatePresence, motion} from "framer-motion";
import {AlertTriangle, Trash2, X} from "lucide-react";
import type {DocNode} from "../../utils/documents.ts";
import Button from "../ui/Button.tsx";
import {countDescendants, isRecursiveDelete} from "./deleteConfirmation.ts";

interface Props {
  open: boolean;
  node: DocNode | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function DeleteConfirmDialog({open, node, onCancel, onConfirm}: Props) {
  const recursive = node ? isRecursiveDelete(node) : false;
  const childCount = node ? countDescendants(node) : 0;
  const title = node?.isDir ? "删除文件夹？" : "删除文档？";
  const targetKind = node?.isDir ? "文件夹" : "文档";

  return createPortal(
    <AnimatePresence>
      {open && node && (
        <motion.div
          className="fixed inset-0 z-[2000] flex items-center justify-center px-4"
          style={{background: "rgba(20,20,30,0.42)"}}
          initial={{opacity: 0}}
          animate={{opacity: 1}}
          exit={{opacity: 0}}
          transition={{duration: 0.13}}
          onClick={onCancel}
        >
          <motion.div
            className="flex w-[420px] max-w-full flex-col overflow-hidden rounded-lg border border-border bg-bg shadow-lg"
            initial={{opacity: 0, scale: 0.96, y: 10}}
            animate={{opacity: 1, scale: 1, y: 0}}
            exit={{opacity: 0, scale: 0.96, y: 10}}
            transition={{duration: 0.16, ease: [0.16, 1, 0.3, 1]}}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-confirm-title"
            aria-describedby="delete-confirm-body"
          >
            <div className="flex shrink-0 items-start gap-3 px-5 pb-3 pt-4">
              <div className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-danger/15 bg-danger/10 text-danger">
                <AlertTriangle size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="delete-confirm-title" className="m-0 text-[18px] font-semibold leading-6 text-text">
                  {title}
                </h2>
                <p className="m-0 mt-1 text-[13px] leading-5 text-text-secondary">
                  请确认这个删除动作。
                </p>
              </div>
              <button
                type="button"
                onClick={onCancel}
                title="关闭"
                className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent text-text-muted transition-colors duration-fast hover:bg-bg-tertiary hover:text-text"
              >
                <X size={17} />
              </button>
            </div>

            <div className="px-5 pb-4">
              <div className="rounded-md border border-border bg-bg-secondary px-3 py-2.5">
                <div className="text-[11px] font-medium leading-4 text-text-muted">
                  将删除的{targetKind}
                </div>
                <div className="mt-1 break-words text-[13px] font-medium leading-5 text-text">
                  “{node.name}”
                </div>
              </div>

              <div id="delete-confirm-body" className="mt-3 rounded-md border border-danger/25 bg-danger/5 px-3 py-2.5 text-[13px] leading-5 text-text-secondary">
                {recursive ? (
                  <>
                    该文件夹包含 <span className="font-semibold text-danger">{childCount} 个子项</span>
                    ，确认后会同时删除其中的子文件夹和子文件。此操作不可撤销。
                  </>
                ) : (
                  <>确认删除后，该{targetKind}会从文件树中移除。此操作不可撤销。</>
                )}
              </div>
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-bg-secondary px-5 py-3">
              <Button type="button" variant="secondary" onClick={onCancel}>
                取消
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={onConfirm}
                className="gap-2 bg-danger hover:bg-danger/90 focus-visible:ring-danger/30"
              >
                <Trash2 size={14} />
                删除
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
